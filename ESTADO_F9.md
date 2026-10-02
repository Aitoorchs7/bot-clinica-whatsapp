# ESTADO F9 · Publicar: que el bot conteste de verdad

> **Lo que entrega esta fase en una frase:** el panel ya está publicado; F9
> termina cuando **un mensaje de WhatsApp real recibe respuesta del bot en
> producción**, con cada pieza que hay por medio —el esquema, el secreto, el
> canal— comprobada por separado y en ese orden, y con el CI midiendo lo que
> dice medir.

Fecha: 27/09/2026 · Rama `f9-publicacion`, desde `origin/main` (`79fd601`) ·
fusionada en `main` como `aaefe04` el 01/10 · el cierre sigue en `f9-cierre`,
desde `aaefe04`

> ⚠️ **Al abrir la fase no se ha tocado producción.** Todo lo que hay hasta §4
> es lectura: el repositorio, el CI, la documentación y lo que el sitio
> publicado le enseña a cualquiera. Cada paso que toque producción —la base de
> datos, las variables de Vercel, Meta, o fusionar en `main`, que publica—
> espera un «sí» explícito.

---

## 0 · Lo que ya está hecho, comprobado por esta sesión

El encargo llegó con un resumen de la sesión anterior. Esto es lo que he podido
comprobar yo, con su salida, y lo que no.

| Afirmación | ¿Comprobada? |
|---|---|
| El PR #1 (F1–F8, 20 commits) está fusionado en `main` como `79fd601` | ✅ §0.1 |
| El sitio publicado sirve el panel detrás del guardián | ✅ §0.2 |
| El CI del merge da los 13 rojos, con una sola causa | ✅ §0.3 |
| Los cuatro secretos `SUPABASE_*_DEV` y `RLS_VIVA` están puestos, y funcionan | ✅ §0.4 |
| Despliegue `dpl_2ATrJx9azo2kx12Cemv32GS4xooC` READY, compilación sin avisos, tres crons registrados | ✅ con un matiz: **el que sirve es otro**, `dpl_FoAz…`, un *redeploy* del mismo commit. §0.5 (28/09) |
| Trece variables de producción, todas «sensitive» | ✅ §0.5 (28/09) |
| El bot contesta por WhatsApp en producción | ⚪ **Nadie lo ha comprobado.** Es el final de esta fase |

### 0.1 · El merge

```
$ git log origin/main --oneline -1
79fd601 Merge pull request #1 from Aitoorchs7/f1-base-de-datos-y-rls
$ git show --no-patch --format=%P 79fd601
770bbf9e9875054ad05bfc4ae4b82a7891f7cb39 6fff56ff007804e4c91a3e4d4d6598fe4fe8dd2e
$ git rev-list --count 770bbf9..6fff56f
20
$ git diff --stat 6fff56f 79fd601
                          (vacío: lo publicado es exactamente el final de F8)
```

### 0.2 · El sitio publicado, 27/09/2026 a las 16:55 UTC

```
/                        307  Location: /panel                  X-Panel-Guardia: proxy
/panel                   307  Location: /entrar?desde=%2Fpanel  X-Panel-Guardia: proxy
/entrar?desde=%2Fpanel   200  <title>Entrar · Panel de la clínica</title>
                              X-Vercel-Id: cdg1::iad1::spvlx-1790528138150-…
```

Demuestra que el panel está publicado y protegido. **No demuestra nada del
bot**: ninguna de las tres peticiones toca Supabase ni Meta. Y la última línea
trae un hallazgo (§3.3).

### 0.3 · El CI del merge (run 36334234453)

```
push · 79fd601 · 16:42:35Z → 16:49:56Z · failure
  comprobaciones-estaticas   success
  auditoria-de-fuga          success
  pruebas-vivas              failure
       Test Files  4 failed | 41 passed | 3 skipped (48)
            Tests  13 failed | 1018 passed | 36 skipped (1067)
  02-provisionales ×3 · 03-purga ×6 · 05-retencion ×3 · rls/03-operacion ×1
  «Cannot find project ref. Have you run supabase link?»   (27 veces en el registro)
```

1018 + 13 = 1031, el recuento local de F8: no falta ni sobra ninguna prueba.
Nueve de los trece son pruebas que no pudieron lanzar su SQL; los otros cuatro
(`05-retencion` y `rls/03`) son **daño colateral**: el mensaje de hace 120 días
que `03-purga` deja sembrado cuando la purga no llega a correr.

### 0.4 · Los secretos del CI, solo por nombre

```
$ gh secret list
SUPABASE_ANON_KEY_DEV           2026-09-22T13:00:18Z
SUPABASE_JWT_SECRET_DEV         2026-09-27T16:26:27Z
SUPABASE_SERVICE_ROLE_KEY_DEV   2026-09-22T13:00:42Z
SUPABASE_URL_DEV                2026-09-22T12:59:49Z
$ gh variable list
RLS_VIVA  true  2026-09-22T13:01:20Z
```

Y funcionan, que es otra cosa: `auditoria-de-fuga` corre con `FUGA_EXIGIDA=1`,
que la pone **roja** si no hay Supabase, y salió verde. Cierra el pendiente 3
de `ESTADO_F8 §8`.

### 0.5 · Vercel, visto con la API (28/09/2026, con tu token)

```
proyecto bot-clinica-whatsapp · nextjs · region de funciones: iad1 · rama de produccion: main
sirviendo en produccion: dpl_FoAzrvS1cyWD3EejdaAJcvjH68kX
  dpl_FoAzrvS1cyWD3EejdaAJcvjH68kX · READY · 79fd601 · 27/09 16:49:42Z · source=redeploy
  dpl_2ATrJx9azo2kx12Cemv32GS4xooC · READY · 79fd601 · 27/09 16:42:36Z · source=git
  dpl_6jevb5oX72YA4kkTYiYA7Dq2DmDG · READY · 770bbf9 · 27/09 15:47:24Z
variables: 13, todas production · sensitive
  27/09 15:47:20Z · las otras doce, a la vez
  27/09 16:49:31Z · SUPABASE_JWT_SECRET            ← once segundos antes del redeploy
crons del despliegue que sirve (activos):
  0 * * * *  /api/cron/recordatorios
  30 4 * * * /api/cron/retencion
  0 6 * * *  /api/cron/salud
compilacion del despliegue que sirve: 99 lineas, 0 con «warn», «deprecat» o «⚠»
```

Lo que dice el orden de las fechas: **`SUPABASE_JWT_SECRET` se cambió después
de publicar, y se volvió a publicar once segundos más tarde.** Como el
despliegue que sirve es posterior a todos los cambios de variables, lleva los
valores actuales de las trece. Que el valor sea **el bueno** es otra cosa: eso
lo dice el punto 2.

**Los registros de ejecución solo se leen en directo.** `/v3/.../events` da
únicamente la compilación, y `/v1/.../runtime-logs` emite desde que se abre la
conexión, sin historial. Visto con una sonda: un `GET` al webhook con un token
de verificación falso apareció en la escucha a los pocos segundos, con la línea
que escribe la propia ruta (`Verificacion del webhook con un verify_token que
no cuadra`). Para mirar algo que hace otra persona, la escucha tiene que estar
abierta antes.

⚠️ **Y cada conexión dura como mucho cinco minutos.** La escucha de una hora
del 28/09 (14:20–15:20 UTC) recogió dos líneas: la sonda propia y, a las
14:26:57, `Exceeded query duration limit of 5 minutes`, que es la propia API
cortando. El bucle volvía a conectar, pero **no dejaba marca al hacerlo**, así
que no se puede demostrar que estuviera escuchando después. Ejemplo: la pasada
del cron de las 15:00 UTC no dejó ni una línea, y eso no se cuenta como «sin
errores». La próxima escucha deja una marca con la hora en cada reconexión.

⚠️ **Y la conexión arranca a ciegas.** Escucha con marcas del 28/09: conexión
abierta a las 17:30:26, sonda a las ~17:30:34 → **no llegó**; sonda a las
17:32:42 → llegó, a la vez que en una segunda conexión abierta aposta. O sea: los
primeros segundos de cada conexión (y cada una dura cinco minutos) pueden no
ver nada. Una escucha sirve para diagnosticar lo que sí aparece; que algo **no**
aparezca no demuestra que no pasara.

---

## 1 · El contrato de cinco campos

**ENTREGA**

| # | Qué | Dónde |
|---|---|---|
| 1 | Producción con las diez migraciones aplicadas en orden y **anotadas** en `supabase_migrations.schema_migrations`. No se cambia ni se añade ninguna migración | La base de producción, tras tu «sí» |
| 2 | La prueba de que producción acepta el token del bot, **sacada del propio despliegue y sin ver el valor** | La ruta del punto 6, en producción |
| 3 | Un mensaje de WhatsApp de verdad contestado por el bot en producción, con sus líneas del registro de Vercel | Meta y Vercel |
| 4 | El SQL de mantenimiento de las pruebas va por `--db-url` (`SUPABASE_DB_URL_DEV`), sin shell y con una guarda de proyecto; `ci.yml` le pasa el secreto; `03-purga` deja de ensuciar a los de al lado; y un cerrojo por referencia hace que las pruebas **no puedan** correr contra producción | `tests/ayuda/mantenimiento.ts`, `.github/workflows/ci.yml`, `tests/trabajos-vivo/03-purga.test.ts`, `tests/ayuda/siembra.ts`, `.env.example` |
| 5 | Tus decisiones, cada una con mi recomendación y la prueba en la que se apoya | §5 de este archivo |
| 6 | Una ruta de salud que dice qué clínicas conoce el despliegue y, de cada una, si el bot puede leer su fila | `src/app/api/cron/…` y sus pruebas |

**PRUEBA**

1. **El inventario de producción, antes y después:** `supabase migration list
   --db-url` **y** una consulta de huellas de solo lectura que mira el objeto
   de cada migración (la tabla, la columna, la política, el job), no solo su
   fila en el historial. Antes de aplicar, `supabase db push --dry-run`.
   Después, diez de diez en las dos.
2. La ruta de salud, **en producción**, dice «aceptado» para el token del bot.
   La misma ruta, en local y con un secreto equivocado, dice «rechazado»: visto
   en rojo.
3. Un «Hola» desde un móvil de verdad al número de la clínica: llega la
   respuesta, el primer mensaje se identifica como asistente virtual, y se
   pegan las líneas del registro de Vercel de esa conversación.
4. El CI del PR con `pruebas-vivas` **en verde** (hoy, 13 rojos). Y en rojo,
   cada rotura con su restauración en la misma orden (`trap … EXIT`):
   - **La purga que falla.** Antes del arreglo, `05-retencion` y `rls/03` se
     ponen rojas: se reproduce el CI en local. Después, solo se ponen rojas las
     pruebas que no han podido comprobar la purga, y **las ajenas siguen
     verdes**.
   - **`SUPABASE_DB_URL_DEV` de otro proyecto.** El SQL no sale.
   - **`NEXT_PUBLIC_SUPABASE_URL` de producción.** La siembra se niega **antes
     de mandar una sola petición**.
5. Tus respuestas; y, si alguna toca Vercel, la lista de variables antes y
   después (nombre, entorno y tipo).
6. Las pruebas de la ruta, con sus rojos: mapa vacío → **rojo**, no «0
   clínicas, todo bien»; clínica en el mapa y no en la base → **rojo** (la
   clínica fantasma de F6); token rechazado → **rojo**. Sin escribir nada y sin
   llamar a Gemini.
7. `pnpm lint`, `pnpm exec tsc --noEmit` y la suite **dos veces con el mismo
   número**.

**LÍMITES**

- **Nada contra producción sin tu «sí»**, paso a paso: base de datos,
  variables de Vercel, Meta, y fusionar en `main`, que publica.
- **Nunca `supabase link` a producción.** §3.1: con esta máquina vinculada a
  producción, `pnpm test` purgaría su historial. A producción se llega solo con
  `--db-url`, y esa URL vive en una variable de usuario de Windows: ni en el
  repositorio ni en `.env.local`.
- **Nunca pruebas contra producción**, y una sola tirada a la vez contra
  desarrollo, contando el CI.
- No se toca ninguna migración ni se añade una. Tampoco las políticas RLS, los
  bloques de prompt, `sin_solape` ni los tres clientes de Supabase: la ruta del
  punto 6 usa `crearClienteBot()` tal cual.
- No se lee `.env.local`. El token de Vercel no se imprime ni se escribe en
  ningún archivo. De las variables se saca nombre, entorno y tipo, nunca el
  valor.
- **Fuera de esta fase**, salvo que lo pidas: pasar el bot a claves de firma
  asimétricas (§3.4, queda como riesgo con fecha), F3b, el doble apunte del
  interruptor y el `README.md`.

**SUPUESTOS**

- Producción es `hzanffqxlpcorrucanxd` (me lo das tú el 27/09) y desarrollo es
  `ggalkkeobyxpodbzlwzj` (el vínculo de esta máquina). Son distintos.
- Producción está en Frankfurt. ✅ **Comprobado el 28/09**: su cadena de
  conexión va a `aws-0-eu-central-1.pooler.supabase.com` (§6).
- Las variables de Vercel se copiaron del proyecto de producción y no del de
  desarrollo. **Sin comprobar**: es justo lo que miden los puntos 2 y 6, y
  desde fuera no se ve (§3.5). 🔴 **Refutado el 01/10** por la ruta de salud:
  `NEXT_PUBLIC_SUPABASE_URL` es la de desarrollo (§11.6).
- La clínica tiene su alta hecha en la base de producción. **Sin comprobar**:
  lo dirá el inventario del punto 1.
- `SUPABASE_URL_DEV` es el proyecto `ggalkkeobyxpodbzlwzj`. **Sin comprobar**
  (es un secreto): la guarda del punto 4 lo comprobará en cada tirada
  comparando referencias.

**FALLOS** — lo que puede salir mal, y cómo se verá

- **El historial miente, y en los dos sentidos.** `schema_migrations` solo sabe
  lo que se aplicó con el CLI: una migración pegada en el editor SQL existe sin
  su fila, y una fila «reparada» puede existir sin sus objetos. Por eso el
  inventario mira los objetos. Si historial y objetos no cuadran, se para: no
  se hace `db push` encima.
- **Verde por ausencia, la cuarta vez.** Con `WHATSAPP_CLINICAS` vacío, el cron
  de cada hora no da error y dice «0 clínicas»; con una clínica que no está en
  la base, la RLS devuelve cero filas. La ruta de salud tiene que dar **rojo**
  en los dos casos, y se verá.
- **Una producción recién creada pasa por desarrollo.** `exigirBaseDeDesarrollo`
  busca pacientes o citas ajenos, y una producción nueva no tiene ninguno. De
  ahí el cerrojo por referencia.
- **La purga que falla ensucia a los de al lado.** Son cuatro de los 13 rojos
  de hoy (§0.3).
- **«No suitable key or wrong key type» no distingue las causas** (§3.4). Por
  eso el punto 2 se cierra viendo «aceptado», no porque falte ese error.
- **La cuota de Gemini** (20 peticiones al día por modelo): la prueba del punto
  3 la gasta; la ruta de salud nueva no llama al modelo.

---

## 2 · Los seis puntos, y dónde está cada uno

| # | Punto | Estado |
|---|---|---|
| 1 | El esquema de producción | ✅ **Cerrado el 28/09: ya estaba entero.** Diez de diez en el historial y en los objetos; nada que aplicar (§6) |
| 2 | El secreto JWT | ✅ **Cerrado el 02/10.** El sitio apuntaba a la Supabase de desarrollo (§11.6); arreglado (§11.7). Con la clínica de prueba en la base y en el mapa, la ruta de salud dice **`al_dia`** en producción: Supabase acepta el token del bot y el bot ve su fila (§11.9) |
| 3 | El canal de punta a punta | 🟡 **Webhook configurado y verificado, `messages` suscrito, y la firma arreglada** (`META_APP_SECRET` estaba mal, §7.3–7.4). **Clínica de prueba en la base de producción y en el mapa, `al_dia`** (§11.8–11.9). **El bot contesta en producción** a un «Hola» firmado: se identifica como asistente virtual y Meta acepta el envío (§11.10). Falta solo que Meta entregue un mensaje real, y eso exige **publicar la app de Meta** (§7.2) |
| 4 | El hueco del CI | ✅ **Cerrado el 28/09.** `pruebas-vivas` verde por primera vez: `1074 passed`, el mismo número que en local (§9.8) |
| 5 | Tus decisiones | ✅ **Todas contestadas.** a y d, cerradas y vistas en producción (§11). b, antes del primer paciente. e, apagar (lo haces tú, §12). c, dicha por ti y sin verificar (§12) |
| 6 | La ruta de salud | ✅ **Publicada y lanzada en producción** (01/10): rojo, `ninguna_clinica`, y ha destapado que el sitio hablaba con la base de desarrollo (§11.6). Relanzada tras el arreglo: `hzanffqxlpcorrucanxd` (§11.7). Con la clínica de prueba: `al_dia` (§11.9) |

---

## 3 · Lo que ha salido de leer, sin tocar nada

### 3.1 · Esta máquina está vinculada a desarrollo, y eso es lo único que hoy impide que `pnpm test` purgue producción

```
supabase/.temp/project-ref   ggalkkeobyxpodbzlwzj   "bot-clinica-whatsapp", eu-central-1
producción                   hzanffqxlpcorrucanxd
```

`consultaDeMantenimiento()` lanza SQL como `postgres` —que se salta la RLS—
contra **el proyecto vinculado**. `03-purga` le pide `purgar_historial(90, 7)`
y `02-provisionales`, `liberar_provisionales(5000)`. Nadie puso ese vínculo de
cerrojo a propósito: se hizo en F1 y nadie lo ha cambiado. Un `supabase link
--project-ref hzanffqxlpcorrucanxd` «solo para mirar las migraciones» dejaría
la siguiente `pnpm test` purgando el historial de producción. Por eso esta fase
no vincula producción nunca, y el punto 4 quita el `--linked`.

### 3.2 · `--linked` no es una conexión: es la API de gestión

```
$ supabase db query --help
  --db-url string   Queries the database specified by the connection string (must be percent-encoded).
  --linked          Queries the linked project's database via Management API.
```

Necesita el vínculo **y** un token de cuenta, y ese token vale para todos tus
proyectos, producción incluida. El CI no tiene ninguna de las dos cosas, y de
ahí salen los 13 rojos. `--db-url` va directo a Postgres con la credencial de
un solo proyecto, que es lo que pides.

Hay un segundo motivo para cambiar la llamada: hoy pasa por un shell
(`shell: true`, para que Windows encuentre `pnpm.cmd`), y una cadena de
conexión con la contraseña codificada (`%40`, `&`) no sobrevive a un shell. El
CLI se puede lanzar sin shell:

```
$ node node_modules/supabase/dist/supabase.js --version
2.117.0
```

`migration list` y `db push` también aceptan `--db-url`, y `db push` tiene
`--dry-run`: el plan del punto 1 se puede enseñar antes de ejecutarlo.

### 3.3 · Las funciones de Vercel corren en Washington (`iad1`), no en Europa

`X-Vercel-Id: cdg1::iad1::…` en `/entrar`: la petición entra por París y la
función se ejecuta en `iad1`. Supabase está en Frankfurt por el RGPD, y esto
tiene dos consecuencias:

- **Los mensajes de los pacientes se procesan en Estados Unidos**, aunque se
  guarden en Frankfurt.
- **Cada consulta del bot cruza el Atlántico dos veces**, y un turno del bot
  hace varias.

✅ **Confirmado con la API el 28/09**: `serverlessFunctionRegion: iad1` en la
configuración del proyecto (§0.5). La decisión es tuya (§5).

### 3.4 · El bot se identifica con el secreto JWT heredado, y Supabase lo tiene marcado como heredado

`bot.ts` firma en HS256 con `SUPABASE_JWT_SECRET` y manda la clave `anon` como
`apikey`. La documentación de Supabase, leída hoy:

- *JWT Signing Keys*: el secreto heredado está «No longer recommended.
  Available for backward compatibility.»; y «Revoking the legacy JWT secret
  means that your application no longer trusts any JWT signed with it».
- *API Keys*: «Supabase is deprecating the `anon` and `service_role` keys by
  the end of 2026».
- La discusión oficial #29260 (última actualización, 17/06/2025): las claves
  heredadas «will be deleted and removed from the Docs / Dashboard», con fecha
  «Late 2026 (TBC)».

Ninguna de las tres le pone fecha al secreto JWT heredado en sí. Pero el bot
depende de él **y** de la clave `anon`, y la segunda sí tiene fecha: finales de
2026, dentro de unos tres meses. No es de esta fase —`bot.ts` es de los que no
se tocan sin confirmación—, pero queda como pendiente con fecha (§8), y la ruta
de salud del punto 6 es lo que lo detectaría el día que pase.

**Lo que dice el panel de producción (lo leíste tú el 28/09 en Project
Settings → JWT Keys):** «Legacy JWT secret (still used)». El proyecto **no** ha
pasado a claves asimétricas: sigue firmando y verificando con el secreto
heredado, así que un token HS256 firmado con ese secreto se acepta. Es la mitad
del punto 2 que depende de Supabase. La otra mitad —que el valor que tiene
Vercel sea ese secreto— solo la puede decir el propio despliegue.

Y una consecuencia para el punto 2: en el CI, un secreto equivocado dio «No
suitable key or wrong key type», y según los casos publicados un proyecto que
ya no acepta el secreto heredado da el mismo error. **Ese mensaje no distingue
las dos causas.** Por eso el punto 2 no se cierra porque falte el error: se
cierra viendo «aceptado».

### 3.5 · El sitio publicado no dice a qué Supabase apunta, y está bien que no lo diga

`crearClienteNavegador()` existe y **no lo importa nadie**: el panel habla con
Supabase solo desde el servidor. En los nueve fragmentos de JavaScript de
`/entrar` no hay ni una URL `*.supabase.co` ni una clave. Para la seguridad es
lo correcto. La consecuencia es que la pregunta «¿el despliegue apunta a
producción o a desarrollo?» no se puede contestar desde fuera: la contesta el
punto 6.

### 3.6 · El cron de cada hora ya habla con producción

`/api/cron/recordatorios` corre cada hora desde el despliegue; la primera
pasada fue a las 17:00 UTC. Por cada clínica de `WHATSAPP_CLINICAS` lee su fila
**con el token del bot** (`exigirClinicaDelCanal`): es lo primero de producción
que usa `SUPABASE_JWT_SECRET`. Si el token se rechaza, si falta el esquema o si
la clínica no existe, el registro dice:

    ⚠  La clinica <id> se queda sin recordatorios en esta pasada: <el error>

⚠️ **Que esa línea no aparezca no demuestra nada.** Con el mapa vacío el bucle
da cero vueltas, y la respuesta es un 200 sin un solo error. Es una pista, no
una prueba, y así se va a usar.

### 3.7 · `SUPABASE_SERVICE_ROLE_KEY` está en producción y nada de `src/` la lee

`grep -rn "SERVICE_ROLE\|service_role" src/` → solo comentarios, ocho, y todos
para decir que **no** se usa. La decisión es tuya (§5).

### 3.8 · El registro de usuarios de Auth en producción: nadie lo ha mirado

`supabase/config.toml` tiene `enable_signup = true`, pero eso viene de la
plantilla y solo vale para una base local. En producción manda el interruptor
«Allow new users to sign up» del panel de Supabase. ✅ **Mirado el 28/09:
está activado.** Un
usuario que se registre por su cuenta no lleva `rol` ni `clinica_id` en
`app_metadata` y la RLS no le devuelve nada, pero no hay motivo para dejar la
puerta abierta: los usuarios los crea `pnpm alta` con la API de administración,
que no la necesita. La decisión es tuya (§5).

---

## 4 · Lo que necesito para el punto 1

Saber qué tiene producción exige leer **dos cosas**: el historial
(`supabase_migrations.schema_migrations`) y los objetos, porque el historial
puede mentir (§1, FALLOS). Y cualquier forma de leerlas pasa por una
credencial de la base de producción. Tres caminos:

| | Qué me das | Qué puedo hacer | Mi opinión |
|---|---|---|---|
| **A** | La cadena de conexión **«Session pooler»** de producción, guardada **tú** como variable de usuario de Windows `SUPABASE_DB_URL_PROD` | `migration list` y la consulta de huellas (solo lectura); luego `db push --dry-run` para enseñarte el plan, y `db push` **después de tu «sí»**. Anota el historial | ✅ **Recomendada.** Vale para un solo proyecto; no pasa por el chat, ni por el repositorio, ni por `.env.local` |
| **B** | Nada. Pegas en el editor SQL de producción una consulta de solo lectura que te doy y me pegas el resultado | El inventario, entero | Sirve para mirar. Para aplicar tendrías que pegar diez archivos en orden (~120 KB de SQL), y no quedarían anotados en el historial |
| **C** | `SUPABASE_ACCESS_TOKEN` | Todo lo anterior | ❌ Vale para **todos** tus proyectos. Lo descartas tú y estoy de acuerdo |

«Session pooler» y no «Direct connection» porque la conexión directa de
Supabase va por IPv6, que muchas redes domésticas no tienen. Si la contraseña
de la base lleva símbolos, hay que codificarla (lo exige el propio CLI: «must
be percent-encoded»). Lo más sencillo en ese caso es generar una nueva solo con
letras y números: nada de lo publicado usa esa contraseña, porque el sitio
entra con las claves y con el secreto JWT.

---

## 5 · Decisiones (tuyas), con mi recomendación

Escrito el 28/09 con la documentación leída ese día. Ninguna está tomada:
cada una espera tu respuesta.

> **Respuestas (29/09):** a · **quitada por ti** de Vercel, comprobado por la
> API (quedan 12 variables, ninguna es `SUPABASE_SERVICE_ROLE_KEY`); sale de
> verdad del sitio con la próxima publicación, porque la que sirve hoy
> (`dpl_2WbG…`) se publicó antes. d · **Frankfurt**: `"regions": ["fra1"]` en
> `vercel.json`, en el PR #2 (`fra1` es `eu-central-1`, la misma región de
> AWS que Supabase, según la lista de regiones de Vercel del 11/08/2026;
> ninguna ruta fija la suya con `preferredRegion`, así que manda
> `vercel.json`). Se comprueba después de publicar con `X-Vercel-Id`.
> b y e: pendientes. c · **facturación vinculada**, según tú (01/10): la clave
> de la API en AI Studio enseña «My Billing Account». No lo he podido ver yo:
> se dará por comprobado cuando el bot conteste más de lo que permite la cuota
> gratuita sin un `429`.
>
> **Después de la fusión (01/10):** a y d, vistas en el despliegue que sirve
> (§11): `fra1` en la cabecera de dos rutas de función, y un despliegue
> posterior al borrado de `SUPABASE_SERVICE_ROLE_KEY`.
>
> **b y e, contestadas por ti el 02/10:** b · el correo de los escalados,
> **antes del primer paciente de verdad**, no ahora: necesita un dominio propio
> y el acuerdo de tratamiento de Resend, y eso va con tener empresa. Hasta
> entonces, el aviso al equipo depende solo de la plantilla `aviso_escalado`.
> e · **apagar** el registro abierto de Auth en producción. Lo haces tú en el
> panel de Supabase (§12, paso 2).

### a · `SUPABASE_SERVICE_ROLE_KEY` en las variables de producción → **quitarla**

- **Prueba:** nada de `src/` la lee (`grep -rn "SERVICE_ROLE\|service_role"
  src/` → solo comentarios que dicen que no se usa). La usan `pnpm alta` y las
  pruebas, que corren **en una máquina**, no en Vercel.
- **Por qué:** es la llave que se salta la RLS entera. En el despliegue no hace
  nada, salvo agrandar el daño de cualquier fallo del servidor: un registro
  que imprima el entorno, una dependencia comprometida. Y Supabase retira las
  claves `service_role` a finales de 2026 (§3.4).
- **Cómo:** borrarla en Vercel y volver a publicar. Una variable borrada sigue
  en el despliegue que ya corre hasta que se publica otro.

### b · El correo de los escalados (`RESEND_API_KEY`, `EMAIL_REMITENTE`) → **sí, antes del primer paciente de verdad**

- **Prueba:** el aviso al equipo tiene **dos caminos a propósito**
  (`src/lib/whatsapp/escalado.ts`): una **plantilla de WhatsApp** al teléfono
  de recepción y un **correo**. Sin correo, todo depende de que esa plantilla
  esté aprobada en Meta, y eso **no lo ha comprobado nadie en producción** (es
  el punto 5 del alta, el que no se puede comprobar desde el código). Si los
  dos fallan, el código lo grita («EL EQUIPO NO SE HA ENTERADO DEL ESCALADO POR
  NINGUNA VIA»), pero el equipo no se entera.
- **Por qué importa:** ante dolor, hinchazón, golpe o sangrado la regla es
  mensaje seguro + teléfono + **aviso al equipo**. Las dos primeras no dependen
  de esto; la tercera, sí.
- **Cómo:** una cuenta de Resend, un dominio de envío verificado (registros
  DNS), la clave y el remitente en Vercel, y volver a publicar. El correo lleva
  el teléfono del paciente (nunca lo que escribió), así que Resend pasa a ser
  encargado del tratamiento: hace falta su acuerdo de tratamiento de datos.
- **Y en paralelo:** comprobar en Meta que la plantilla del aviso está
  aprobada, con el procedimiento de `entregas/plantillas-meta.md`.

### c · La cuota gratuita de Gemini → **activar la facturación antes del primer paciente de verdad**

- **La cuota:** 20 peticiones al día **por modelo** (medido en F7). Cada
  mensaje de un paciente gasta al menos una del clasificador y entre una y tres
  del cerebro, y la ruta `/api/cron/salud` gasta una de cada modelo al día. En
  la práctica, un puñado de mensajes al día. Luego, `429` hasta el día
  siguiente: el bot deja de contestar.
- **Los datos**, según las condiciones de la API de Gemini (modificadas el
  28/04/2026): para usuarios del Espacio Económico Europeo, «the terms under
  "How Google uses Your Data" in "Paid Services" apply to all Services,
  including … unpaid quota», es decir, no se usan para mejorar productos. Pero
  la misma página mantiene en lo gratuito «Do not submit sensitive,
  confidential, or personal information to the Unpaid Services», y la tabla
  de precios marca lo gratuito como «Content used to improve our products:
  Yes». Con mensajes de pacientes, esa ambigüedad sobra. Pagando desaparece.
- **El precio** (página de precios, actualizada el 24/09/2026), por millón de
  tokens: `gemini-3.6-flash` 0,75 $ de entrada y 3,75 $ de salida **hasta el
  31/12/2026**, y el doble desde el 1/1/2027; `gemini-3.1-flash-lite` 0,25 $
  y 1,50 $. El coste real por conversación **no lo invento**: se mide con la
  primera semana, porque cada mensaje guarda sus tokens (`mensajes`) y
  `GEMINI_EUR_POR_MTOKEN_*` convierte eso en euros.
- **Cómo:** vincular una cuenta de facturación al proyecto de Google AI Studio
  (así se pasa al nivel 1). Los límites exactos de cada nivel solo los enseña
  AI Studio.
- De paso: `gemini-embedding-001` ya no aparece en la página de precios (sale
  `gemini-embedding-2`). Hoy no se usa: la FAQ va entera en el prompt.

### d · La región de las funciones → **Frankfurt (`fra1`)**

- **Prueba:** `serverlessFunctionRegion: iad1` (§0.5), y la documentación de
  Vercel (11/08/2026): «By default, Vercel Functions execute in Washington,
  D.C., USA (iad1) for all new projects». Nadie lo eligió.
- **Por qué:** Supabase está en `eu-central-1` (§6). Hoy cada consulta del bot
  cruza el Atlántico dos veces y los mensajes de los pacientes se procesan en
  Estados Unidos, justo lo contrario de «región EU por el RGPD».
- **Cómo:** una línea en `vercel.json` (`"regions": ["fra1"]`), que entra en
  un PR y se publica al fusionar. El plan Pro lo permite. Se comprueba después
  con la cabecera `X-Vercel-Id`, que tiene que decir `fra1` donde hoy dice
  `iad1`.

### e · El registro abierto de Auth → **apagarlo**

- **Prueba:** «Allow new users to sign up: activado» (lo miraste tú, §3.8).
- **Por qué:** los usuarios del panel los crea `pnpm alta` con la API de
  administración, que no necesita el registro público. Abierto, cualquiera con
  la clave anónima puede crearse una cuenta. No vería nada, porque la RLS no le
  da ni `rol` ni `clinica_id`, pero es una puerta que no hace falta.
- **Cómo:** en Supabase de producción, Authentication → desactivar «Allow new
  users to sign up». No afecta a entrar con contraseña ni a los enlaces de
  recuperación. Lo haces tú en el panel; no pasa por el código.

---

## 6 · Punto 1 · El esquema de producción: ya estaba entero

**28/09/2026, 14:25–14:27 UTC.** Opción A, autorizada por ti con tres lecturas
en orden y **sin `db push` de verdad**. Todo con `node
node_modules/supabase/dist/supabase.js … --db-url`, sin shell, leyendo
`SUPABASE_DB_URL_PROD` de tu variable de usuario en cada orden y pasando la
salida por un filtro que tapa la cadena y su contraseña.

**La cadena** (forma, sin contraseña): usuario `postgres.hzanffqxlpcorrucanxd`,
host `aws-0-eu-central-1.pooler.supabase.com`, puerto 5432 → Session pooler,
Frankfurt.

### 6.1 · El historial

```
$ supabase migration list --db-url $SUPABASE_DB_URL_PROD
Connecting to remote database...
local 20260916100100 = remote 20260916100100
local 20260916100200 = remote 20260916100200
local 20260916100300 = remote 20260916100300
local 20260916100400 = remote 20260916100400
local 20260916100500 = remote 20260916100500
local 20260916100600 = remote 20260916100600
local 20260916100700 = remote 20260916100700
local 20260919120000 = remote 20260919120000
local 20260920100000 = remote 20260920100000
local 20260921120000 = remote 20260921120000
"message":"Migrations listed"
```

(El CLI la da en JSON, una entrada por migración; aquí, en una línea cada una.)

### 6.2 · Los objetos, por si el historial miente

Una sola `SELECT` sobre catálogos del sistema (`pg_extension`, `pg_class`,
`pg_proc`, `pg_constraint`, `pg_policies`, `pg_attribute`), que no toca ninguna
tabla de la aplicación. Un marcador por migración:

```
PRODUCCION                                          CONTROL EN DESARROLLO
✅  1 extensiones   vector, btree_gist y pg_cron                  ✅
✅  2 tablas        las 15 tablas de public, con RLS activada     ✅
✅  3 solape        constraint sin_solape en citas                ✅
✅  4 rls           autorizacion.es_bot() y clinicas_bot_select   ✅
✅  5 rpc           consultar_huecos y crear_cita                 ✅
✅  6 retencion     mantenimiento.purgar_historial                ✅
✅  7 integridad    purgar_historial(3 args), escalados sin resumen ✅
✅  8 auditoria     la politica auditoria_clinica_insert          ✅
✅  9 trabajos      recordatorios con RLS y liberar_provisionales ✅
✅ 10 borrador      borrador y rondas_aclaracion en conversaciones ✅
·· politicas RLS en public: 71                                     71
```

**Y vista decir que no**, porque dos columnas de ✅ solo demuestran que la
consulta sabe decir que sí. Copia con cuatro marcadores rotos a propósito
(`sin_solape_x`, `es_bot_x`, `nargs = 4`, `rondas_aclaracion_x`), contra
desarrollo:

```
✅ 1 · ✅ 2 · ❌ 3 · ❌ 4 · ✅ 5 · ✅ 6 · ❌ 7 · ✅ 8 · ✅ 9 · ❌ 10
```

Exactamente las cuatro rotas, y ninguna más.

Los jobs de `pg_cron`, en producción:

```
activo  */5 * * * *  liberar-provisionales-caducadas  select mantenimiento.liberar_provisionales(5000)
activo  15 3 * * *   purgar-historial-90-dias         select mantenimiento.purgar_historial(90, 5000, 7)
```

La purga programada es la de la 007 (tres argumentos), no la de la 006.

### 6.3 · El simulacro

```
$ supabase db push --dry-run --skip-vault --db-url $SUPABASE_DB_URL_PROD
DRY RUN: migrations will *not* be pushed to the database.
Connecting to remote database...
{"upToDate":true,"dryRun":true,"migrations":[],"seeds":[],"roles":[],"message":"Remote database is up to date."}
```

**No hay nada que aplicar.** El pendiente «la 010 no está en producción» era
cierto cuando no había producción y dejó de serlo sin que nadie lo apuntara: la
010 está, en el historial y en la base.

### 6.4 · Lo que te prometí antes de empezar, comprobado después

```
vinculo del CLI (supabase/.temp, 9 archivos): identico antes y despues
  project-ref sigue siendo: ggalkkeobyxpodbzlwzj
git status: identico antes y despues (M PLAN.md · ?? ESTADO_F9.md)
la cadena o la contrasena de produccion en algun archivo
  (proyecto, ~/.supabase y scratchpad): 1008 revisados, 0 con coincidencia
CONTROL, el mismo recorrido buscando la referencia de produccion
  (que si esta escrita): 1008 revisados, 1 -> ESTADO_F9.md
```

Sin el control, el cero sería el verde que no ha mirado nada.

---

## 7 · Punto 3 · El canal: lo visto hasta ahora

- **En Meta no hay ningún webhook configurado** (lo miraste tú el 28/09: no
  aparece ninguna URL de devolución de llamada). Así que **ningún mensaje de
  WhatsApp ha llegado nunca a producción**, y el sitio no ha fallado: nadie le
  ha mandado nada.
- La ruta existe y contesta como debe a una verificación con el token
  equivocado (28/09, 14:18 UTC):

  ```
  GET /api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=<falso>&hub.challenge=123456
  HTTP/1.1 403 Forbidden · cuerpo: forbidden · sin redirecciones
  ```

- `WHATSAPP_VERIFY_TOKEN` existe en Vercel (§0.5), pero es «sensitive» y no se
  puede leer: en Meta hay que escribir **el mismo valor**, y eso solo lo sabe
  quien lo puso.
- **Los registros solo enseñan los fallos.** Medido el 28/09 a las 17:41 UTC con
  una escucha abierta: `GET /entrar` (200, no escribe nada) **no aparece**; la
  sonda con token falso (403, escribe una línea) sí. Una verificación correcta
  de Meta devuelve 200 sin escribir nada, así que **es invisible en el
  registro**. Entre las 17:34 y las 17:41 no hubo ninguna línea de «no cuadra»
  salvo las sondas propias, y eso es compatible con tres cosas: que Meta
  verificara bien, que su llamada cayera en un arranque a ciegas, o que Meta no
  llegara a llamar. **No se cuenta como verificado.** Lo decide lo que enseñe
  Meta.

### 7.1 · Lo que has hecho tú (28/09)

- `.env.local` lleva `SUPABASE_DB_URL_DEV` con la forma de una cadena del
  Session pooler de desarrollo: la comprobación de solo `True`/`False` dio
  `True`. El secreto de GitHub del mismo nombre se volvió a poner a las
  17:27:08 UTC. Que funcionen lo dirá el punto 4.
- «Verificar y guardar» en Meta, pulsado. La captura que llegó después es
  **Permisos y funciones**, que no dice nada del webhook: pendiente de ver el
  bloque Webhook.

### 7.2 · El bloque Webhook de Meta (captura del 28/09, «Paso 2. Configuración de producción»)

- **URL de devolución de llamada guardada:**
  `https://bot-clinica-whatsapp.vercel.app/api/whatsapp/webhook`. El
  identificador de verificación, guardado (16 caracteres, oculto). «Verificar y
  guardar» en gris (no hay nada pendiente) y aparece «Suprimir suscripción»:
  hay una suscripción activa. Meta solo guarda la URL cuando su verificación
  sale bien, así que es la prueba de que el `WHATSAPP_VERIFY_TOKEN` de Vercel
  coincide. Los registros no lo podían decir (§7).
- Meta **suscribió solo** «algunos campos de uso común»: `account_alerts`,
  `account_review_update` y `account_update` a la vista. **`messages`, sin ver
  todavía.**
- Los campos van en la versión **v26.0** del webhook; el envío está clavado en
  v25.0 (`config.ts`). Anotado, no es un fallo: el formato de `messages` no ha
  cambiado entre las dos, pero es una segunda versión que nadie ha clavado.
- 🔴 **El aviso naranja cambia el plan:** «Las aplicaciones solo podrán recibir
  webhooks de prueba enviados desde el panel de la aplicación mientras esta no
  esté publicada. No se entregará ningún dato de producción, incluidos los de
  los administradores, desarrolladores o evaluadores de la aplicación, a menos
  que esta se haya publicado.» **La app de Meta no está publicada**, así que
  ningún «Hola» real llegaría al bot, ni siquiera desde tu móvil. Publicar la
  app es un paso nuevo, manual y de producción.
- `messages`: **Suscrito** (lo miraste tú el 28/09).
- El número del bot es **el de prueba de Meta**, `+1 (555) 185-0806` (01/10).
  Con un número de prueba, WhatsApp solo entrega a los destinatarios de su
  lista (WhatsApp → Configuración de la API → «Para»), así que la prueba de
  punta a punta exige tener tu móvil en esa lista.
- **No hay ninguna clínica todavía, ni empresa** (01/10). Para probar, una
  clínica de prueba con datos inventados. Para publicar la app, Meta pide una
  política de privacidad, y alguien tiene que figurar como responsable: es una
  decisión legal, aparcada hasta que se vaya a publicar.

### 7.5 · Probar el canal sin publicar la app de Meta

Mientras la app no esté publicada, Meta no entrega mensajes reales, ni de los
administradores (§7.2). Lo que sí se puede probar, de menos a más:

1. ✅ La conexión con Meta: URL verificada y firma de la app (§7.3–7.4).
2. Lo que conoce producción: la ruta de salud, en cuanto se publique.
3. El bot de punta a punta: un aviso idéntico al de Meta, **firmado por
   nosotros** con la clave secreta de la app, con el `phone_number_id` del
   número de prueba y tu móvil como remitente. Recorre el bot entero (base,
   Gemini, respuesta) y la respuesta sale por la API de WhatsApp a tu móvil.
   Lo único que no prueba es que Meta entregue el mensaje. Exige una clínica
   de prueba en producción y su par en `WHATSAPP_CLINICAS`, que tú escribas
   antes al número (se abre la ventana de 24 h) y tu móvil en la lista de
   destinatarios. Escribe en producción: paso a paso y con «sí».

### 7.3 · 🔴 El mensaje de prueba de Meta, rechazado por la firma

Pulsaste «Test» en `messages` a las 20:04 (Madrid). La escucha, a los cinco
segundos de reconectar:

```
-- conexion 8 18:03:54
18:03:59 error POST /api/whatsapp/webhook -1 ⚠ Webhook con firma que no cuadra: 401.
```

La firma que Meta pone con la clave secreta de la app **no cuadra con
`META_APP_SECRET` de Vercel**. Con el mensaje de ejemplo (número de mentira)
no se pierde nada, pero con uno real sería igual: 401, y Meta reintentando
durante horas algo que el bot no va a aceptar nunca. El `.env.example` ya
avisaba de la confusión más probable: firmar con `WHATSAPP_TOKEN` en vez de con
la clave secreta da 401 en todos los webhooks.

La misma línea saldría si Meta no mandara la cabecera, así que antes de tocar
Vercel se comprueba el valor con un comando que firma un aviso vacío
(`{"object":"whatsapp_business_account","entry":[]}`, que pasa la firma y se
ignora sin tocar la base) con la clave que pegue una persona. Probado antes de
dártelo:

```
control: firma de PowerShell = firma de Node (el calculo de firma.ts)
  1er intento: NO coinciden  <- PowerShell 5.1 le quitaba las comillas al
                                cuerpo al pasarlo como argumento a node:
                                {object:whatsapp_business_account,entry:[]}
  pasando el cuerpo por el entorno: COINCIDEN
con un secreto de mentira (18:05:11 UTC): NO COINCIDE (401)
```

**Resultado con la clave secreta de la app, copiada por ti de Meta
(Configuración de la app → Información básica): «NO COINCIDE».** Confirmado:
el `META_APP_SECRET` de Vercel no es la clave de esta app. Arreglo: cambiarlo
en Vercel y volver a publicar. Toca producción; lo hace una persona, para que
la clave no pase por el chat.

**Hecho por ti el 28/09**, comprobado con la API:

```
18:11:34Z  META_APP_SECRET · production · sensitive      (13 variables, las mismas)
18:11:54Z  dpl_2WbGMVsy1FxtBJNkqwpSXpD4t9Fc · redeploy · 79fd601
18:12:31Z  READY · sirviendo en produccion · crons movidos a el
```

Escucha nueva sobre `dpl_2WbG…` (cada despliegue tiene su registro), viva a
las 18:12:52 con una sonda propia.

### 7.4 · ✅ La misma prueba de Meta, antes y después

```
18:03:59 UTC  (META_APP_SECRET viejo)  POST /api/whatsapp/webhook  ⚠ Webhook con firma que no cuadra: 401.
18:18:12 UTC  (META_APP_SECRET nuevo)  POST /api/whatsapp/webhook  ⚠ Webhook de un phone_number_id ajeno: 123456123
```

El mismo botón «Test» de `messages`, pulsado por ti a las 20:04 y a las 20:18
(Madrid). La segunda línea solo puede salir **después** de `firmaValida()`, así
que la firma de Meta pasa. El número `123456123` es el de mentira del ejemplo:
no está en `WHATSAPP_CLINICAS` y el webhook lo descarta sin escribir en la base.
Con el rojo y el verde del mismo botón, `META_APP_SECRET` queda demostrado.

Lo que **no** demuestra: que la clínica esté en `WHATSAPP_CLINICAS`, que su
fila exista en la base de producción, ni que Supabase acepte el token del bot.
El ejemplo de Meta no llega hasta ahí. Eso lo dice el punto 6.

---

## 9 · Punto 4 · El hueco del CI

### 9.1 · 🔴 Antes de empezar: las pruebas vivas se SALTABAN en esta máquina

La primera tirada de `02-provisionales` y `03-purga` con el código nuevo dio
`2 skipped`, en 0,6 s y sin sembrar. Un «saltado» no es un verde, así que se
buscó por qué, **sin leer ningún valor** de `.env.local`:

```
codificacion: UTF-8 sin BOM, CRLF, 102 lineas          -> el archivo esta sano
entorno del proceso: ninguna variable SUPABASE_*        -> nada pisa .env.local
claves (solo si estan):  NEXT_PUBLIC_SUPABASE_URL  presente
                         NEXT_PUBLIC_SUPABASE_ANON_KEY presente
                         SUPABASE_SERVICE_ROLE_KEY presente
                         SUPABASE_JWT_SECRET       NO ESTA
                         SUPABASE_DB_URL_DEV       presente
nombres parecidos:       linea 17 -> "SUPABASE_JWT_SECRET_DEV"
```

La clave se llama `SUPABASE_JWT_SECRET_DEV`, que es el nombre del **secreto
de GitHub**, y las pruebas (y el bot en local) buscan `SUPABASE_JWT_SECRET`.
Sin ella, `HAY_BASE_DE_DATOS` es falso y **todas** las pruebas vivas se saltan
con un aviso que en una tirada parcial ni siquiera se imprime. No se toca
`.env.local` desde aquí: lo cambia una persona. `.env.example` ahora lo avisa.

### 9.2 · Lo que se ha cambiado

| Archivo | Qué |
|---|---|
| `tests/ayuda/mantenimiento.ts` | `--db-url` con `SUPABASE_DB_URL_DEV`, lanzando la CLI con Node y **sin shell**. Se niega si falta la cadena, si no se sabe de qué proyecto es, si es de producción, o si no es **el mismo proyecto que siembra la suite**. Tapa la cadena y su contraseña en cualquier mensaje |
| `tests/ayuda/entorno.ts` | `REFS_DE_PRODUCCION` y el cerrojo `exigirQueNoSeaProduccion()`, sin variable que lo desactive |
| `tests/ayuda/siembra.ts` | `sembrar()` y `limpiar()` llaman al cerrojo **antes de crear el cliente** |
| `tests/trabajos-vivo/03-purga.test.ts` | El mensaje viejo va en una conversación abierta **propia**; escalados y conversaciones se borran **por id** en `afterEach`; y una prueba nueva: el SQL corre como `postgres` |
| `.github/workflows/ci.yml` | `SUPABASE_DB_URL_DEV` en el `.env.local` de `pruebas-vivas` |
| `.env.example` | La variable nueva, y el aviso del nombre de `SUPABASE_JWT_SECRET` |
| `tests/cerrojos/01-produccion.test.ts` | 13 pruebas de nivel 1 de todo lo anterior |

### 9.3 · Los cerrojos, vistos en rojo (nivel 1)

Cada rotura con su restauración en la misma orden (copia + `trap … EXIT`):

```
ROJO · sembrar() sin su cerrojo (limpiar() conserva el suyo)
  AssertionError: La siembra se ha negado, pero después de salir a la red:
  contra producción ya habría mandado algo.: expected 3 to be +0
ROJO · limpiar() sin su cerrojo
  AssertionError: promise resolved "undefined" instead of rejecting
ROJO · la lista de produccion, vacia                         4 failed | 9 passed
ROJO · el SQL de mantenimiento sin comparar proyectos
  «con la de OTRO proyecto que el de la siembra, se niega»: expected [Function] to throw
ROJO · tapar() que no tapa
  expected 'fallo conectando a postgresql://postg…' not to contain 'Secreta99'
¿han vuelto los tres archivos byte a byte? si · ninguna copia .bak suelta
y el verde vuelve: Tests 13 passed (13)
```

La primera es la que justifica contar peticiones: sin su cerrojo, `sembrar()`
**también** acaba negándose (porque llama a `limpiar()`), pero después de tres
peticiones. Una prueba que solo mirara el mensaje de error saldría verde.

Y un rojo que fue de la prueba, no del código: pasar `undefined` a
`cadenaDeMantenimiento()` no vacía la variable, activa el valor por defecto y
lee `.env.local`. Con tu cadena, que es válida y de desarrollo, no había nada
que negar. De paso eso confirma que tu `SUPABASE_DB_URL_DEV` es del proyecto
`ggalkkeobyxpodbzlwzj`. Arreglado en la prueba con `vi.stubEnv`.

### 9.4 · Contra desarrollo, por `--db-url` (28/09, con `.env.local` arreglado por ti)

```
$ pnpm vitest run tests/trabajos-vivo/02-provisionales.test.ts \
                  tests/trabajos-vivo/03-purga.test.ts tests/trabajos-vivo/06-clinicas.test.ts
 Test Files  3 passed (3)
      Tests  17 passed (17)                  <- cero saltadas
```

### 9.5 · Los 13 rojos del CI, reproducidos en local, y un segundo agujero

**Primer intento: no se puede dar por bueno.** Con la purga rota a propósito
(`SUPABASE_DB_URL_DEV` de otro proyecto: la guarda se niega antes de lanzar
nada, como en CI fallaba la CLI), el «antes» dio `rls/03` roja y
`05-retencion` **verde**, y el «después» al revés. Vitest ordena los archivos
por su historial (los que fallaron, primero), así que **el verde de una u otra
dependía de si corría antes o después de `03-purga`**. Y releyendo con eso en
la cabeza salió el segundo agujero, que el arreglo había dejado pasar:

> «a los 90 días la fila de `eventos_webhook` desaparece entera» planta una
> fila de hace 100 días y **no la apunta** para borrarla: confía en que se la
> lleve la purga. Con la purga rota se queda, y `05-retencion` la cuenta. Es el
> mismo error que el mensaje viejo, en otra tabla. Arreglado: se apunta.

**Segundo intento, con el orden FIJADO** (una configuración de Vitest
temporal, creada y borrada en la misma orden, con un secuenciador que corre
`02-provisionales → 03-purga → 05-retencion → rls/03`, que es el orden en que
se hace daño):

```
== ANTES · el 03-purga de F8 (origin/main), con la purga sin poder correr
    Test Files  4 failed (4)
         Tests  13 failed | 27 passed (40)
     1 · tests/trabajos-vivo/02-provisionales.test.ts   1 verdes ·  3 ROJOS
     2 · tests/trabajos-vivo/03-purga.test.ts           0 verdes ·  6 ROJOS
     3 · tests/trabajos-vivo/05-retencion.test.ts       5 verdes ·  3 ROJOS
     4 · tests/rls/03-operacion.test.ts                21 verdes ·  1 ROJOS
   ¿03-purga ha vuelto al de F9 byte a byte? si

== DESPUES · el 03-purga de F9, con la purga igual de rota
    Test Files  2 failed | 2 passed (4)
         Tests  10 failed | 31 passed (41)
     1 · tests/trabajos-vivo/02-provisionales.test.ts   1 verdes ·  3 ROJOS
     2 · tests/trabajos-vivo/03-purga.test.ts           0 verdes ·  7 ROJOS
     3 · tests/trabajos-vivo/05-retencion.test.ts       8 verdes ·  0 ROJOS
     4 · tests/rls/03-operacion.test.ts                22 verdes ·  0 ROJOS
¿queda la configuracion temporal? no, borrada
```

El «antes» es **exactamente** el CI del 27/09: los mismos 13, repartidos igual
(3 · 6 · 3 · 1). El «después» deja rojas solo las pruebas que no han podido
comprobar su SQL —que es lo que tienen que hacer: «no he podido comprobarlo»
no es «está bien»— y las dos ajenas, limpias. La séptima de `03-purga` es la
nueva de `current_user`.

La lección, que es la cuarta vez que sale en este proyecto: **una prueba de
contaminación sin el orden fijado puede salir verde por el orden**. La
primera tirada lo habría dado por arreglado con un agujero dentro.

### 9.6 · La suite, dos veces, y el navegador

```
$ pnpm test      (inicio 18:48:51 UTC)
 Test Files  48 passed | 3 skipped (51)
      Tests  1070 passed | 36 skipped (1106)
   Duration  178.23s
$ pnpm test      (inicio 18:51:55 UTC)
 Test Files  48 passed | 3 skipped (51)
      Tests  1070 passed | 36 skipped (1106)
   Duration  177.09s
$ pnpm test:e2e
  31 passed (50.6s)
```

F8 cerró en `1031 passed | 36 skipped (1067)`. Las 39 nuevas: 13 de
`tests/cerrojos`, 14 de `tests/cron/03-clinicas`, 5 de la ruta nueva en
`tests/cron/02-rutas`, 6 de `tests/trabajos-vivo/06-clinicas` y 1 de
`current_user` en `03-purga`. Las 36 saltadas son las mismas.

`04-interruptor.spec.ts:189` salió verde otra vez. Sigue sin explicación y
sigue abierto (pendiente 4): nada de esta fase toca el panel.

### 9.7 · El CI del PR #2, y lo que solo podía verse ahí

Run 36468873972 (commit `ca04acd`):

```
comprobaciones-estaticas  success
auditoria-de-fuga         success
pruebas-vivas             failure
      Tests  10 failed | 1060 passed | 36 skipped (1106)
  02-provisionales ×3 · 03-purga ×7   <- solo las que lanzan SQL
  05-retencion y rls/03: VERDES       <- el daño colateral, resuelto también en CI
  Error: La CLI no ha devuelto JSON. Salida:
  ┌───┐
  │ n │
  ├───┤
  │ 1 │
  └───┘
```

Lo que dice de verdad: el secreto `SUPABASE_DB_URL_DEV` está, la guarda lo ha
dejado pasar (es del mismo proyecto que `SUPABASE_URL_DEV`), **la conexión
funciona y el SQL corre**. Lo que falla es leer la respuesta: la CLI contestó
con una **tabla**.

**La causa, medida:** la CLI cambia de formato según quién la lance. La misma
consulta, contra desarrollo:

```
como en CI (--agent no), sin formato       -> tabla  (│ 1 │ postgres │)
como en CI (--agent no) + --output-format json -> [ { "n": 1, "usuario": "postgres" } ]
aqui (detecta un agente) + --output-format json -> { "boundary": …, "rows": [ … ], "warning": … }
```

Esta ayuda funcionaba en local desde F1 **porque la CLI detectaba que la
lanzaba un agente** y contestaba en JSON por su cuenta. En CI nadie lo había
visto porque hasta hoy no llegaba ni a conectar. Es otra forma de «verde por
el entorno»: la prueba pasaba por quién la lanzaba, no por lo que medía.

**El arreglo:** `--agent no --output-format json`, fijados, y
`filasDeLaSalida()` lee la lista (y la forma `{ rows }`, por si acaso). Una
tabla, o un JSON que no son filas, es un **error**, nunca una lista vacía.
Cuatro pruebas de nivel 1 nuevas con las tres formas medidas.

```
ROJO · sin --output-format json (con --agent no, como el CI), 02-provisionales:
      Tests  3 failed | 1 passed (4)
Error: No se ha podido leer la respuesta de la CLI (no hay JSON en la salida).
¿ha vuelto byte a byte? si
VERDE · con el arreglo, 02 + 03 + 06 contra desarrollo:  Tests  17 passed (17)

$ pnpm test   (19:10:47 UTC)   Tests  1074 passed | 36 skipped (1110)
$ pnpm test   (19:13:44 UTC)   Tests  1074 passed | 36 skipped (1110)
```

De paso, confirmado por `--db-url` y con la CLI en modo CI: `current_user` es
`postgres`.

### 9.8 · ✅ El CI, en verde entero (run 36471168599, commit `f58d116`)

```
comprobaciones-estaticas  success   19:17:13 → 19:19:16 UTC
auditoria-de-fuga         success   19:17:13 → 19:19:03 UTC
pruebas-vivas             success   19:19:07 → 19:29:27 UTC
 Test Files  48 passed | 3 skipped (51)
      Tests  1074 passed | 36 skipped (1110)     <- el mismo número que en local
  31 passed (2.0m)                               <- Playwright
```

Es la primera vez que `pruebas-vivas` sale verde en este repositorio. Venía de
13 rojos (§0.3). **Punto 4 cerrado.**

(Una de las esperas en segundo plano de esta máquina terminó con «exit code
1»: fue un corte hacia api.github.com en la espera, no el CI. Se dice aquí
para que nadie lo lea al revés en el registro de la sesión.)

---

## 10 · Punto 6 · La ruta de salud: `/api/cron/clinicas`

| Archivo | Qué |
|---|---|
| `src/lib/trabajos/clinicas.ts` | Por cada par de `WHATSAPP_CLINICAS`: (1) el **token** del bot, con una consulta mínima; (2) el **canal**, con `exigirClinicaDelCanal()`, la misma función que el webhook. Veredictos: `atiende`, `inestable`, `no_atiende`, `token_rechazado`, `mal_configurado`. Dice también a qué host de Supabase apunta el despliegue |
| `src/app/api/cron/clinicas/route.ts` | El cerrojo de siempre (`CRON_SECRET`), el resultado al registro línea a línea y 200 / 503 / 500 |
| `vercel.json` | Cron diario a las 06:15 UTC |
| `tests/cron/03-clinicas.test.ts` | 14 pruebas de nivel 1, con el doble en la frontera del SDK |
| `tests/cron/02-rutas.test.ts` | La ruta nueva entra en las pruebas del cerrojo. Con el mapa vacío contesta **500**, a propósito |
| `tests/trabajos-vivo/06-clinicas.test.ts` | 6 pruebas de nivel 2 contra desarrollo, en verde (abajo) |

**Lo que no es verde aunque no haya ni un error**, y aquí es rojo: el mapa
vacío (500, `ninguna_clinica`), la clínica fantasma (token válido, cero filas:
`no_atiende`) y una mala entre buenas (el estado es el de la peor). Y un matiz
medido al escribir: sin `SUPABASE_JWT_SECRET`, supabase-js devuelve el fallo
como `status 0`, igual que una caída de red; se clasifica como
`mal_configurado` y 500, no como `inestable` y 503, porque no se arregla
esperando.

```
$ pnpm vitest run tests/cron tests/cerrojos
 Test Files  4 passed (4)
      Tests  54 passed (54)
$ pnpm exec tsc --noEmit   -> sin salida
$ pnpm lint                -> sin salida
```

Y contra Supabase de desarrollo, lo que el nivel 1 no puede saber (28/09):

```
$ pnpm vitest run tests/trabajos-vivo/06-clinicas.test.ts --reporter=verbose
  Supabase, a un token firmado con otro secreto: No suitable key or wrong key type
 ✓ la clinica A con su numero: atiende, y el token del bot queda ACEPTADO
 ✓ con un secreto JWT equivocado: token_rechazado, HTTP 401
 ✓ sin secreto JWT: mal_configurado, y no «inestable» aunque supabase-js diga status 0
 ✓ LA CLINICA FANTASMA: un clinica_id que no existe. Token valido, cero filas, y rojo
 ✓ el numero de la B con la identidad de la A: no atiende
  salud de las clinicas · al_dia · supabase ggalkkeobyxpodbzlwzj.supabase.co · 1 clinica(s)
    900000000000001 -> 389b6f28-f944-4c0b-87a5-eb3e50426e86 · atiende
 ✓ LA RUTA ENTERA: cerrojo, WHATSAPP_CLINICAS del entorno y cliente del bot -> 200 y al_dia
      Tests  6 passed (6)
```

Es el punto 2 de F9 ensayado en desarrollo: con el secreto bueno, `atiende`;
con otro, Supabase contesta **401 · «No suitable key or wrong key type»** y la
ruta lo llama por su nombre.

**Cómo lanzarla a mano (encontrado el 01/10):** la copia del CLI de Vercel
que había en esta máquina (60.1.3, caché de `npx`) hace `vercel crons run`
con un `POST /v1/projects/{id}/crons/run?teamId=…` y el cuerpo `{ path,
schedule }`. Es una llamada normal de la API: si el token limitado al
proyecto la acepta, se puede lanzar la comprobación sin conocer
`CRON_SECRET`. **Sin probar**: hasta que se publique, la ruta no existe en
producción.

**Cómo se consultará en producción, y lo que no está comprobado:** es un cron,
así que se puede lanzar a mano (`vercel crons run /api/cron/clinicas`, en la
documentación de Vercel). Que esa llamada a mano lleve `CRON_SECRET` como la
programada **no lo dice la documentación**: se verá la primera vez. Si no, pasa
sola cada día a las 06:15 UTC. ✅ **Visto el 01/10:** la llamada por la API
pasa el cerrojo, así que lleva `CRON_SECRET` (§11.6).

---

## 11 · Después de la fusión: lo que sirve producción (01/10/2026)

El PR #2 lo fusionaste tú: `aaefe04`, a las 18:04:28 UTC. `git diff --stat
131e469 aaefe04` sale vacío: lo publicado es exactamente lo que se revisó. Todo
lo de esta sección es lectura (la API de Vercel con tu token, y tres `GET` sin
credencial al sitio). El CI de `main` (run 36904109929) estaba lanzando
`pruebas-vivas` contra desarrollo mientras tanto, y por eso no se lanzó nada
vivo.

### 11.1 · El despliegue (API, ~18:10 UTC)

```
sirviendo en produccion (targets.production.id): dpl_GeVZ3CjbXZAn6JUiN4ntqjskPbL9
  READY · aaefe04 · rama main · creado 18:04:31Z · listo 18:05:01Z · source=git
  alias: bot-clinica-whatsapp.vercel.app, bot-clinica-whatsapp-apolo4team.vercel.app,
         bot-clinica-whatsapp-git-main-apolo4team.vercel.app
  regions: fra1
el anterior: dpl_2WbGMVsy1FxtBJNkqwpSXpD4t9Fc · READY · 79fd601 · 28/09 18:11:54Z · redeploy
```

Y desde fuera, sin la API: el HTML de `/entrar` lleva
`data-dpl-id="dpl_GeVZ3CjbXZAn6JUiN4ntqjskPbL9"`. El dominio sirve ese
despliegue.

### 11.2 · Frankfurt, visto en la función y no solo en la configuración

```
18:11:21Z GET /api/cron/clinicas          401 {"estado":"no autorizado"}
          X-Matched-Path: /api/cron/clinicas   X-Vercel-Id: cdg1::fra1::pnlwl-1790878283675-…
18:11:22Z GET /api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=sonda-falsa&hub.challenge=123
          403 forbidden
          X-Matched-Path: /api/whatsapp/webhook X-Vercel-Id: cdg1::fra1::j8pqh-1790878284347-…
18:11:23Z GET /entrar                     200   X-Panel-Guardia: proxy
          X-Vercel-Id: cdg1::fra1::glwpz-1790878285369-…
```

El 27/09 era `cdg1::iad1` (§0.2). `proxy.ts` deja fuera `/api` entero
(`matcher`), así que las dos primeras respuestas las da **la propia función**:
es la región donde se ejecuta el código del bot. El 401 dice de paso que la
ruta nueva existe en producción y que su cerrojo está puesto.

⚠️ **El proyecto sigue diciendo `serverlessFunctionRegion: iad1`.** Manda
`vercel.json`, que fija la región en cada despliegue. Consecuencia: si alguien
quita `"regions"` de `vercel.json`, las funciones vuelven a Washington sin
ningún aviso. Se puede cambiar también en el panel de Vercel (Settings →
Functions → Function Region) para que las dos digan lo mismo; es un cambio de
producción y no lo he hecho.

✅ **Cambiado con tu «sí» (01/10)**, por la API:

```
ANTES   18:38:20Z · serverlessFunctionRegion: iad1 · sirviendo: dpl_GeVZ3CjbXZAn6JUiN4ntqjskPbL9
PATCH   18:38:21Z · OK · la respuesta dice serverlessFunctionRegion: fra1
DESPUES 18:38:21Z · serverlessFunctionRegion: fra1 · sirviendo: dpl_GeVZ3CjbXZAn6JUiN4ntqjskPbL9
18:38:27Z GET /api/cron/clinicas · 401 · X-Vercel-Id: cdg1::fra1::hq7pp-1790879908975-…
```

Ahora el proyecto y `vercel.json` dicen lo mismo. Solo afecta a las próximas
publicaciones (la que sirve no ha cambiado). Se deshace con el mismo `PATCH`
y `iad1`.

### 11.3 · Las cuatro crons

```
crons del despliegue dpl_GeVZ…:          crons activas del proyecto:
  0 * * * *   /api/cron/recordatorios      deploymentId: dpl_GeVZ3CjbXZAn6JUiN4ntqjskPbL9
  30 4 * * *  /api/cron/retencion          enabledAt 27/09 15:47:45Z · disabledAt - ·
  0 6 * * *   /api/cron/salud              updatedAt 01/10 18:05:01Z
  15 6 * * *  /api/cron/clinicas           (las mismas cuatro, mismos horarios)
```

Registradas y activas, y movidas al despliegue nuevo en el mismo segundo en
que quedó listo. Que estén registradas no dice que corran: eso lo dice cada
pasada.

### 11.4 · `SUPABASE_SERVICE_ROLE_KEY`, fuera del despliegue que sirve

```
variables: 12, todas production · sensitive (nombre, entorno, tipo; sin valores)
  27/09 15:47:20Z  WHATSAPP_PHONE_NUMBER_ID · WHATSAPP_TOKEN · WHATSAPP_VERIFY_TOKEN ·
                   CRON_SECRET · WHATSAPP_CLINICAS · DEEPGRAM_API_KEY ·
                   NEXT_PUBLIC_SUPABASE_URL · NEXT_PUBLIC_SUPABASE_ANON_KEY ·
                   GOOGLE_AI_API_KEY · SUPABASE_PROJECT_REF
  27/09 16:49:31Z  SUPABASE_JWT_SECRET
  28/09 18:11:34Z  META_APP_SECRET
¿SUPABASE_SERVICE_ROLE_KEY en la lista? no
variable modificada mas tarde: 28/09 18:11:34Z · despliegue creado: 01/10 18:04:31Z · ¿posterior? si
```

**La hora exacta del borrado no se puede leer**: la lista de variables no
guarda las borradas, y el registro de actividad da 403 con tu token, que está
limitado al proyecto (`"You don't have permission to list the event"`, en
`/v3/events` y en `/v1/events`). Queda acotada entre fechas: el 28/09 a las
18:11:34 había 13 variables (§7.3), el 29/09 había 12 y ninguna era esta (§5),
y el despliegue que sirve es del 01/10. El que servía hasta hoy, `dpl_2WbG…`
(28/09 18:11:54Z), **es anterior al borrado**: por eso llevaba la clave dentro
hasta esta publicación.

**Decisiones a y d: cerradas.** Pendiente 14: cerrado.

### 11.5 · 🔴 El CI de `main` salió rojo: un clic de navegador, y no es de F9

Run 36904109929 (push de `aaefe04`):

```
comprobaciones-estaticas  success   18:04:35 → 18:06:40 UTC
auditoria-de-fuga         success   18:04:36 → 18:06:22 UTC
pruebas-vivas             failure   18:06:27 → 18:17:27 UTC
   Test Files  48 passed | 3 skipped (51)
        Tests  1074 passed | 36 skipped (1110)      <- Vitest, el mismo número que en el PR
   ✘ 25 tests/e2e/04-interruptor.spec.ts:87:7 › apagar el interruptor ›
        y el asistente vuelve a decirlo en cuanto se enciende (30.1s)
        Test timeout of 30000ms exceeded.
   1 failed · 30 passed (2.5m)                      <- Playwright
```

El árbol de `aaefe04` es idéntico al de `131e469`, que pasó entero en el PR
(run 36600187683). La misma prueba, con el mismo código, verde allí y roja
aquí. Antes de llamarlo «inestable», la traza que sube el CI
(`playwright-trazas`):

```
pasos de la prueba (segundos desde el inicio)
  2.48  entrarComo() termina: la URL ya es /panel
  2.48  Navigate /panel/conocimiento  ->  termina bien a los 3.84
  3.84  Click «encender-publico»      ->  espera 26 s a un boton que no aparece
  foto del fallo: la AGENDA (/panel), no /panel/conocimiento

peticiones de documento, con la cookie de sesion comparada por su huella SHA-256
  18:16:20.906 POST /entrar                  200  set-cookie sb-…-auth-token  huella 56a6c088d76c
  18:16:21.992 GET  /panel/conocimiento      307 -> /entrar?desde=…          huella 56a6c088d76c
  18:16:22.216 GET  /entrar?desde=…          307 -> /panel                   huella 56a6c088d76c
  18:16:22.449 GET  /panel                   200                             huella 56a6c088d76c
```

**El mismo token, rechazado por el guardián y aceptado 0,2 s después.** No es
una carrera de la prueba con la cookie (el navegador ya la mandaba): es
`supabase.auth.getUser()` diciendo «no» una vez, un segundo después de entrar,
contra el Auth de desarrollo. Y `proxy.ts` no mira el `error` de `getUser()`:
cualquier fallo de Auth se trata como «no hay sesión». Por eso no se puede
saber qué contestó Auth exactamente; el servidor de la prueba no escribió nada.

Lo que significa:

- **Para la seguridad, nada malo.** El guardián falla cerrado, que es lo que
  tiene que hacer.
- **Para una persona de recepción, en producción, sí pasaría:** un fallo
  pasajero de Auth la saca a `/entrar`, y como `/entrar` con sesión manda
  siempre a `/panel` (sin mirar `desde`), acaba en la Agenda en vez de donde
  iba. Molesto, no peligroso.
- **No es de esta fase:** F9 no toca `proxy.ts` ni el panel. Es el mismo
  archivo que el pendiente 4, pero otro síntoma.

En el CI del PR #3 (run 36913327940, mismo código) la misma prueba salió
**verde**: `31 passed`. Eso confirma que falla unas veces sí y otras no, y no
lo arregla.

Arreglos posibles, **ninguno hecho** (fuera de F9; quedan como pendiente 19, de acuerdo contigo el 01/10):
`proxy.ts` escribe el error de `getUser()` en el registro y reintenta una vez
si es pasajero; `/entrar` con sesión respeta un `desde` del panel; y la prueba
comprueba la URL después de `goto`, para que el fallo diga «te ha echado a la
Agenda» y no «30 s esperando un botón».

### 11.6 · 🔴 La ruta de salud, en producción: `ninguna_clinica`, y **el sitio apunta a la Supabase de desarrollo**

Con tu «sí» (01/10). Escucha del registro abierta antes, sonda propia vista
antes de lanzar y otra vista después, y el `POST /v1/projects/{id}/crons/run`
que salió de la caché del CLI:

```
despliegue que sirve: dpl_GeVZ3CjbXZAn6JUiN4ntqjskPbL9 · ahora 18:31:25Z
-- sonda previa 1 enviada 18:31:36 · HTTP 403
-- escucha abierta 18:31:41 · HTTP 200
   18:31:37 error GET /api/whatsapp/webhook -1 ⚠ Verificacion del webhook con un verify_token que no cuadra.
-- sonda previa VISTA en la escucha 18:31:42
-- POST crons/run 18:31:43 · HTTP 200 · {"invocationAt":1790879504350}
   18:31:44 error GET /api/cron/clinicas -1 salud de las clinicas · ninguna_clinica · supabase ggalkkeobyxpodbzlwzj.supabase.co · 0 clinica(s) · WHATSAPP_CLINICAS esta vacio: este despliegue no atiende a ninguna clinica.
-- sonda final 1 enviada 18:32:28 · HTTP 403
   18:32:29 error GET /api/whatsapp/webhook -1 ⚠ Verificacion del webhook con un verify_token que no cuadra.
-- sonda final VISTA en la escucha 18:32:34
== resumen
   escucha viva antes: si · despues: si
   cron lanzada: si (HTTP 200)
   lineas de /api/cron/clinicas: 1
```

Tres cosas, por orden de gravedad:

1. **🔴 `ggalkkeobyxpodbzlwzj` es desarrollo. Producción es `hzanffqxlpcorrucanxd`.**
   El host sale de `NEXT_PUBLIC_SUPABASE_URL` (`clinicas.ts:135`), y esa misma
   variable es la que usan los tres caminos a Supabase: el bot (`bot.ts:72`),
   el panel (`servidor.ts:24`) y el guardián (`proxy.ts:80`). O sea, **el sitio
   publicado entero, panel y bot, habla con la base de desarrollo**. La base de
   producción, con sus diez migraciones (§6), no la usa nadie. Queda
   **refutado** el supuesto de §1 («las variables de Vercel se copiaron del
   proyecto de producción»), y contestada la pregunta de §3.5.
   - **Lo que no ha pasado, comprobado en el código:** ninguna cron de
     producción ha escrito en desarrollo. `recordatorios` y `retencion` recorren
     `WHATSAPP_CLINICAS` (`recordatorios.ts:146`, `retencion.ts:129`), que está
     vacío, y `salud` solo llama a Gemini. Ningún paciente ha escrito: la app de
     Meta no está publicada y no hay clínica.
   - **Lo que sí implica hoy:** el panel publicado autentica contra el Auth de
     desarrollo, donde están los usuarios de prueba, cuya contraseña está escrita
     en el repositorio (`tests/e2e/ayuda.ts`). Con el repositorio en la mano se
     entra al panel publicado y se ven los datos sembrados, que son inventados.
     El repositorio es privado.
   - **Y si se hubiera llegado a publicar así:** los mensajes de pacientes de
     verdad acabarían en la base que la suite siembra, purga y limpia en cada PR.
2. **`ninguna_clinica`: `WHATSAPP_CLINICAS` está vacío.** Esperado, porque no
   hay clínica (§7.2). Con el mapa vacío la ruta **no llega a probar el token**:
   esa prueba va por clínica. **El punto 2 sigue abierto**, y ahora depende de
   arreglar antes lo del punto 1 de esta lista.
3. **✅ La llamada a mano por la API lleva `CRON_SECRET`.** La línea solo puede
   salir después de pasar el cerrojo, que sin el secreto contesta 401 sin
   escribir nada. Lo que §10 daba por no comprobado («que esa llamada a mano
   lleve `CRON_SECRET` como la programada»), comprobado. Y el endpoint
   `crons/run`, que nunca se había probado, funciona con el token limitado al
   proyecto.

**El arreglo** (toca producción: lo hace una persona, para que las claves no
pasen por el chat): en Vercel, las cuatro variables de Supabase con los valores
**del proyecto de producción** (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET` y
`SUPABASE_PROJECT_REF`), y volver a publicar. Después, otra vez esta ruta:
tiene que decir `supabase hzanffqxlpcorrucanxd.supabase.co`.

### 11.7 · ✅ Arreglado: el sitio ya habla con la base de producción

**Las variables, cambiadas por ti** (01/10, leídas por la API sin valores):

```
ahora 19:13:49Z · total: 12
  2026-10-01 19:11:01Z · NEXT_PUBLIC_SUPABASE_URL · production · encrypted  <- cambiada hoy
  2026-10-01 19:11:51Z · NEXT_PUBLIC_SUPABASE_ANON_KEY · production · encrypted  <- cambiada hoy
  2026-10-01 19:12:17Z · SUPABASE_JWT_SECRET · production · sensitive  <- cambiada hoy
  2026-10-01 19:12:48Z · SUPABASE_PROJECT_REF · production · sensitive  <- cambiada hoy
  (las otras ocho, sin tocar desde el 27/09 y el 28/09)
¿estan las cuatro? 4 de 4 · ¿SUPABASE_SERVICE_ROLE_KEY? no
```

Las dos `NEXT_PUBLIC_*` han pasado de «sensitive» a «encrypted». No es un
problema: la URL y la clave `anon` son públicas por diseño. Las dos secretas
siguen «sensitive».

**Publicado con tu «sí»**, volviendo a publicar `dpl_GeVZ…` (mismo commit),
para que la compilación recoja las variables:

```
-- POST /v13/deployments 19:14:29 · HTTP 200 · dpl_H1oZcgtDqCkmnyC9A5eax98V8Evw · INITIALIZING · commit aaefe04
   19:14:35 · BUILDING
   19:15:15 · READY
sirviendo en produccion: dpl_H1oZcgtDqCkmnyC9A5eax98V8Evw · creado 19:14:30Z · regions: fra1
crons activas del proyecto -> deploymentId: dpl_H1oZcgtDqCkmnyC9A5eax98V8Evw (las cuatro, mismos horarios)
```

**La ruta de salud, otra vez** (escucha viva antes y después):

```
-- POST crons/run 19:15:59 · HTTP 200 · {"invocationAt":1790882161026}
   19:16:01 error GET /api/cron/clinicas -1 salud de las clinicas · ninguna_clinica · supabase hzanffqxlpcorrucanxd.supabase.co · 0 clinica(s) · WHATSAPP_CLINICAS esta vacio: este despliegue no atiende a ninguna clinica.
   escucha viva antes: si · despues: si
```

Y desde fuera: `/` y `/panel` redirigen con la marca del guardián, y `/entrar`
da 200 desde `cdg1::fra1` con `data-dpl-id="dpl_H1oZ…"`.

Lo que queda demostrado y lo que no:

- ✅ **La URL es la de producción.** Lo dice el propio despliegue.
- ✅ Los usuarios de prueba de desarrollo ya no entran en el panel publicado:
  el panel autentica contra el Auth de producción, que no los tiene.
- ⚪ **La clave `anon` y el secreto JWT, sin comprobar.** Con el mapa vacío la
  ruta no prueba el token, y una petición sin sesión no llega a usar la clave.
  Se comprueban las dos a la vez cuando haya una clínica en el mapa: es el
  punto 2, y pasa por los pasos 1 y 2 de §7.5.
- ℹ️ El panel publicado no tiene usuarios hasta que se creen con el alta en
  producción. Esperado.

### 11.8 · La clínica de prueba, dada de alta en producción (02/10/2026)

Paso 1 de §7.5, con tu «sí». Tu móvil ya está en la lista «Para» del número de
prueba (lo dijiste tú). Datos que diste: el identificador del número
`1143963372124362`, el de la WABA `887494041017015`, un teléfono inventado y el
correo `cobaltiautomations@gmail.com`.

**Cómo:** el alta oficial (`scripts/alta-clinica.mjs`), con una ficha de datos
inventados que vive en el scratchpad, no en el repositorio:

- Teléfono de recepción `+447700900123`, del rango que Ofcom reserva para
  ficción: no puede ser de nadie.
- Política de privacidad en `ejemplo.test`, que no resuelve nunca.
- Una fila de `config` y una pregunta frecuente confidenciales, con el marcador
  `F9-CONFIDENCIAL-7Q2X`.

Para dirigirla a producción, la URL y las dos claves de producción se pasan
solo al proceso del alta, desde dos variables de usuario de Windows que pusiste
tú (`SUPABASE_SERVICE_ROLE_KEY_PROD`, `NEXT_PUBLIC_SUPABASE_ANON_KEY_PROD`).
`process.loadEnvFile('.env.local')` **no pisa** lo que ya está en el entorno
(medido con un archivo de mentira), así que `.env.local` no puede colar ninguna
de desarrollo. El enlace para poner contraseña se tapa en la salida.

**Antes, todo lectura:**

```
service_role: ref = hzanffqxlpcorrucanxd y role = service_role     si
anon:         ref = hzanffqxlpcorrucanxd y role = anon             si
service_role en produccion: GET clinicas -> 200 · 0 clinica(s) · slug y numero libres
anon en clinicas:          401 · {"code":"42501","message":"permission denied for table clinicas"}
CONTROL clave falsa:       401 · {"message":"Invalid API key"}
anon en /auth/v1/settings: 200 · CONTROL clave falsa: 401 Invalid API key
la ficha, con el validador del proyecto: errores 0 · avisos 0
cerrojo del lanzador con una service_role falsa: «NO SE LANZA», codigo 1
```

El primer intento de comprobación esperaba un 200 vacío de la `anon` en
`clinicas` y paró: estaba mal planteado. La migración de RLS quita a `anon`
todos los permisos sobre las tablas (`20260916100400_rls.sql:846`), y el `42501`
lo confirma **en producción**. Una clave falsa da otro error, y eso es lo que
distingue las dos causas.

**El alta (13:54 UTC):**

```
-- cerrojo: ficha si · service_role de hzanffqxlpcorrucanxd: si · anon de hzanffqxlpcorrucanxd: si
-- alta contra https://hzanffqxlpcorrucanxd.supabase.co · 13:54:36Z
  ok  creada · clinica_id b53d5bf6-61aa-43c0-a1c0-54b4a46d47be
  ok  1 gabinete(s) · 5 tramo(s) de horario · 2 tratamiento(s)
  ok  4 pregunta(s) frecuentes (3 publicas en la ficha)
  ok  4 fila(s) de config, con las dos obligatorias
  ok  10 bloques de prompt (9 activos)
  ok  cobaltiautomations@gmail.com · rol propietario · creado y comprobado entrando de verdad
  pendiente 1: WHATSAPP_CLINICAS "1143963372124362": "b53d5bf6-61aa-43c0-a1c0-54b4a46d47be" y volver a publicar
  pendiente 2: plantillas de Meta (alta:comprobar --plantilla)
-- el alta ha terminado con codigo 0 · 13:54:39Z
```

**Después, contado con otra credencial** (`postgres`, por
`SUPABASE_DB_URL_PROD`, solo lectura):

```
{"slug":"prueba-f9","id":"b53d5bf6-61aa-43c0-a1c0-54b4a46d47be","wa_phone_number_id":"1143963372124362",
 "wa_waba_id":"887494041017015","activa":true,"telefono_recepcion":"+447700900123",
 "gabinetes":1,"horarios":5,"tratamientos":2,"faq":4,"faq_publicas":3,"config":4,"config_publicas":3,
 "bloques":10,"bloques_activos":9}
auth.users: cobaltiautomations@gmail.com · app_metadata rol=propietario, clinica_id=b53d5bf6-… ·
            nada en user_metadata
```

Es la única clínica de producción. **No se ha lanzado `pnpm alta:comprobar`:**
son pruebas contra la base, y la regla es no lanzar pruebas contra producción.

De paso: **`WHATSAPP_PHONE_NUMBER_ID` no lo lee nadie en `src/`.** El número
de salida sale del mapa y de cada aviso. Es una variable de Vercel que sobra.
No se toca.

Después borraste de Windows `SUPABASE_SERVICE_ROLE_KEY_PROD` y
`NEXT_PUBLIC_SUPABASE_ANON_KEY_PROD`. Comprobado: «NO ESTA» las dos. El control,
`SUPABASE_DB_URL_PROD` y `VERCEL_TOKEN`, sale «esta».

### 11.9 · ✅ Punto 2 cerrado: `al_dia` en producción (02/10/2026)

Paso 2 de §7.5, con tu «sí»: el par en `WHATSAPP_CLINICAS`, volver a publicar,
y la ruta de salud.

```
-- PATCH WHATSAPP_CLINICAS · HTTP 200 · WHATSAPP_CLINICAS · sensitive · 2026-10-02 14:02:28Z
   total 12 antes y despues · otras variables cambiadas por esto: ninguna
-- POST /v13/deployments 14:02:41 · HTTP 200 · dpl_C74em35HeqjCnT1YdLmCE1B2RFM5 · commit aaefe04
   14:02:47 · BUILDING · 14:03:27 · READY
sirviendo: dpl_C74em35HeqjCnT1YdLmCE1B2RFM5 · READY · regions fra1 · crons activas en: dpl_C74em… (4)
-- sonda previa VISTA en la escucha 14:03:57
-- POST crons/run 14:03:58 · HTTP 200 · {"invocationAt":1790949839882}
   14:04:01 info GET /api/cron/clinicas -1 salud de las clinicas · al_dia · supabase hzanffqxlpcorrucanxd.supabase.co · 1 clinica(s)
-- sonda final VISTA en la escucha 14:04:49
```

**Por qué `al_dia` cierra el punto 2:** `estadoDeLaSalud()` solo devuelve
`al_dia` si **todas** las clínicas tienen el veredicto `atiende`
(`clinicas.ts:115`). Con una sola clínica, eso quiere decir dos cosas:

1. Supabase de producción **aceptó el token del bot**, firmado con el
   `SUPABASE_JWT_SECRET` de Vercel y mandado con su clave `anon`. Las dos son
   las buenas.
2. `exigirClinicaDelCanal()`, la misma función que usa el webhook, vio
   **exactamente una** fila de `clinicas`: la suya, con
   `wa_phone_number_id = 1143963372124362`.

**Lo que no se ha visto: la línea por clínica.** La ruta escribe dos líneas
seguidas (el resumen y `1143963372124362 -> b53d… · atiende`), y la escucha
solo recibió la primera. Relanzada una vez más (14:05:56, solo lectura), con la
fila en crudo:

```
CRUDO {"level":"info","message":"salud de las clinicas · al_dia · supabase hzanffqxlpcorrucanxd.supabase.co · 1 clinica(s)",
       "messageTruncated":false,"rowId":"1790949958967","source":"function","timestampInMs":1790949958967,
       "requestMethod":"GET","requestPath":"/api/cron/clinicas","responseStatusCode":-1}
```

`rowId` es la marca de tiempo en milisegundos. Lo más probable es que dos
líneas escritas en el mismo milisegundo choquen y la API se quede con una. No
está demostrado. **Consecuencia para el punto 3:** la escucha en vivo puede
perder líneas cuando una ruta escribe varias de golpe. Que una línea no
aparezca no quiere decir que no se escribiera (pendiente 21).

### 11.10 · 🟡 El bot contesta en producción: todo menos la entrega de Meta (02/10/2026)

Pasos 3 y 4 de §7.5. Tú escribiste «Hola» desde tu móvil (+34 685 22 74 13)
al número de prueba, lo que abre la ventana de 24 h; ese mensaje no llega al
bot porque la app no está publicada. Pusiste la clave secreta de la app como
variable de usuario (`META_APP_SECRET_PROD`), y con eso firmé un aviso
idéntico al de Meta.

```
despliegue que sirve: dpl_C74em35HeqjCnT1YdLmCE1B2RFM5 · ahora 14:13:40Z
-- sonda previa VISTA en la escucha 14:13:57
-- aviso VACIO con la firma buena 14:13:57 · HTTP 200 · EVENT_RECEIVED
-- CONTROL aviso VACIO con firma falsa 14:13:58 · HTTP 401 · unauthorized
-- el «Hola» simulado: de +34685227413 a 1143963372124362 · id wamid.PRUEBAF9.1790950438.9cdf6fb4
-- POST del «Hola» firmado 14:13:58 · HTTP 200 · EVENT_RECEIVED
   14:13:59 error POST /api/whatsapp/webhook -1 ⚠ Webhook con firma que no cuadra: 401.   <- el CONTROL
-- sonda final VISTA en la escucha 14:15:20
   escucha viva antes: si · despues: si · lineas recibidas: 3
```

**La escucha no recogió ni una línea del procesamiento.** El bot sí escribió
(el contador escribe en el registro en cada prompt montado), y la escucha
estaba viva antes y después. Todo lo que pasa dentro de `after()`, es decir
después de contestar el 200, no ha llegado a la API de registros en vivo.
Amplía el pendiente 21: **para el bot, lo que manda es la base, no la
escucha.**

**La base de producción** (solo lectura, por `SUPABASE_DB_URL_PROD`, 14:15:52):

```
eventos_webhook  msg:wamid.PRUEBAF9.1790950438.9cdf6fb4 · recibido 14:14:00.17 · procesado 14:14:12.23
conversaciones   +34685227413 · abierta · requiere_humano false · iniciada 14:14:00.42
mensajes  1 · paciente · entregado · «Hola»                                       · 14:14:00.73
          2 · bot      · enviado   · tokens 4698 / 86 · wamid.HBgLMzQ2ODUyMjc0MTMVAgARGBJENTFCRTc3NEFENzQ1RDgzOEIA · 14:14:10.90
              «Hola, soy Asistente, el asistente virtual de Clínica de prueba F9. Quien contesta es un
               sistema automático, no una persona del equipo. Aquí está cómo tratamos los datos:
               https://ejemplo.test/privacidad. ¿En qué puedo ayudar?»
eventos   contador_prompt · 14:14:09.13 · alarma false
          faq 3 de 3 (0 retenidas) · config 3 de 3 · bloques 9 de 9 · horarios 5 de 5 · tratamientos 2 de 2
```

Lo que demuestra:

- ✅ **El camino entero del bot, en producción:** firma, anotación única del
  evento, conversación, los 8 s que agrupan mensajes, clasificador y cerebro
  en Gemini, respuesta guardada y enviada. Unos 12 s de punta a punta.
- ✅ **Se identifica como asistente virtual en el primer mensaje** (art. 50 del
  Reglamento de IA) y enlaza la política de privacidad de la clínica.
- ✅ **Meta aceptó el envío:** el `wa_message_id` de la respuesta es uno de
  verdad (`wamid.HBgL…`), devuelto por la API de WhatsApp. Se queda en
  «enviado» porque los avisos de estado (entregado, leído) son webhooks, y con
  la app sin publicar no llegan.
- ✅ **Barandilla 2, en producción:** el bot vio 3 de las 4 preguntas
  frecuentes y 3 de las 4 filas de `config` (el total real se contó con
  `postgres` en §11.8). En las dos tablas, la que falta es la confidencial. El
  contador dice «3 de 3» porque su segundo número es lo que le devolvió la
  consulta al bot, no el total de la tabla (`contador.ts:13-28`). La respuesta
  no lleva el marcador `F9-CONFIDENCIAL-7Q2X`.
- ✅ **La respuesta llegó a tu móvil** (lo confirmaste tú el 02/10). Es la
  única prueba de entrega que hay mientras la app no esté publicada.
- ⚪ **Que Meta entregue un mensaje real al webhook:** no se puede probar hasta
  publicar la app (§7.2). Es lo único del punto 3 que falta.

Después borraste `META_APP_SECRET_PROD` de Windows. Comprobado: «NO ESTA»; el
control (`SUPABASE_DB_URL_PROD`, `VERCEL_TOKEN`) sale «esta». Tu número y los
dos mensajes siguen en producción; los borra la purga a los 90 días, o antes si
se pide.

---

### 11.11 · Después de fusionar el PR #3 (02/10/2026)

**La publicación de `main`**, leída por la API:

```
sirviendo: dpl_EMEPtWWj83b4ecUptsXvEFDUWdsp · READY · commit 050f64b · source=git · creado 14:35:30Z · regions fra1
alias: bot-clinica-whatsapp.vercel.app · crons activas en dpl_EMEP… (4) · proyecto: fra1
variables: 12 · ultima modificada 14:02:28Z · ¿publicacion posterior? si
```

**🔴 El último CI del PR #3 salió rojo, y se fusionó así.** No fue el código:
fueron dos tiradas a la vez contra la base de desarrollo.

```
PR #3 (735d878)  pruebas-vivas      14:28:38 → 14:37:10  failure
                   ✘ 02-roles.spec.ts:57      14:36:26  page.waitForURL: Test timeout of 30000ms exceeded.
                   ✘ 05-escalados.spec.ts:27  14:37:06  No hay ninguna clinica sembrada con el slug rls-prueba-a
                   ✘ 05-escalados.spec.ts:61  14:37:07  No hay ninguna clinica sembrada con el slug rls-prueba-a
                   [WebServer] El panel de la clinica b8b83a85-… no ha recibido exactamente su clinica (recibidas 0)
fusion           14:35:24
main (050f64b)   auditoria-de-fuga  14:35:31 → 14:37:10  success   <- siembra y limpia el mismo fixture
                 pruebas-vivas      14:37:14 → 14:47:30  success   Tests 1074 passed · 31 passed (Playwright)
```

La fusión lanzó el CI de `main` con el del PR todavía en marcha, y
`auditoria-de-fuga` de `main` se llevó el fixture de debajo de las pruebas de
navegador del PR. El mismo árbol, corriendo solo en `main`, salió verde entero.
La causa de fondo está en `ci.yml`: `concurrency.group` es
`${{ github.workflow }}-${{ github.ref }}`, uno por rama, así que un PR y `main`
no se esperan. Hoy, la regla «una sola tirada a la vez contra desarrollo» en el
CI depende de que nadie fusione con el CI del PR sin terminar (pendiente 22).

## 12 · Lo que tienes que hacer tú, sí o sí (02/10/2026)

> **Hechos por ti el 02/10:** los pasos 1, 2, 3 y 4. El 1 está comprobado
> (§11.11). El 2 (el registro apagado) **no lo he podido comprobar**: hace falta
> la clave `anon` de producción para leer `/auth/v1/settings`, y ya no está en
> el equipo. El 3 y el 4 los dices tú.

Solo lo que no puede hacer un agente: decisiones, cuentas, pagos, identidad y
claves que no deben pasar por el chat. Donde hay una parte técnica que puedo
hacer yo después, va marcado **→ luego, conmigo**. Por orden de urgencia.

### A · Ya (unos minutos cada uno)

1. **GitHub · fusionar el PR #3** cuando su CI salga verde.
   https://github.com/Aitoorchs7/bot-clinica-whatsapp/pull/3 → «Merge pull
   request» → «Confirm merge». Solo lleva documentación; publica lo mismo que
   ya sirve.
2. **Supabase · apagar el registro abierto** (decisión e). Proyecto de
   **producción** (`hzanffqxlpcorrucanxd`) → Authentication → Sign In /
   Providers → desactivar «Allow new users to sign up» → Save. No afecta a
   entrar con contraseña ni al alta. **→ luego, conmigo:** compruebo que un
   registro con la clave anon da error.
3. **Google · confirmar la facturación de Gemini** (decisión c, hoy solo dicha
   por ti). En AI Studio, la clave del bot tiene que estar en un proyecto con
   facturación (nivel de pago). En la consola de Google Cloud → Facturación →
   **Presupuestos y alertas**, pon un presupuesto mensual con aviso por correo.
   El precio de `gemini-3.6-flash` **se duplica el 1/1/2027** (§5c).
4. **Meta · comprobar que el `WHATSAPP_TOKEN` no caduca.** Ha durado más de
   cinco días, así que no es el temporal de 24 h, pero puede ser uno de 60
   días. Lo que tiene que ser: un token de un **usuario del sistema**
   (Configuración del negocio → Usuarios del sistema) con caducidad «Nunca» y
   los permisos `whatsapp_business_messaging` y
   `whatsapp_business_management`. Si no lo es, generas uno así y lo pegas tú
   en Vercel. **→ luego, conmigo:** vuelvo a publicar.

### B · Antes del primer paciente de verdad

5. **Lo legal: quién es el responsable.** Empresa o autónomo, y con eso:
   - la política de privacidad;
   - el contrato de encargado del tratamiento con cada clínica (la clínica es
     la responsable y tú, su encargado);
   - los acuerdos de tratamiento de datos (DPA) con los proveedores: Supabase,
     Vercel, Google (Gemini), Meta, Deepgram y Resend;
   - el registro de actividades de tratamiento.

   Esto conviene revisarlo con un asesor de protección de datos: no es algo que
   deba decidir un agente. **→ luego, conmigo:** la página `/privacidad` con tu
   texto.
6. **Meta · publicar la app.**
   - La URL de la política de privacidad (paso 5).
   - El caso de uso «Conecta con los clientes a través de WhatsApp».
   - La **verificación del negocio** en el administrador comercial.
   - Hasta que esté publicada, Meta no entrega ningún mensaje real. Es lo único
     que falta del punto 3 (§11.10).
7. **Meta · el número de verdad de la clínica.**
   - Darlo de alta en la WABA, con su nombre visible aprobado y su PIN de
     verificación en dos pasos.
   - Un **método de pago** en la cuenta de WhatsApp Business.
   - **→ luego, conmigo:** su `phone_number_id` en la ficha y en
     `WHATSAPP_CLINICAS`.
8. **Meta · crear y aprobar las tres plantillas**, con el cuerpo exacto de
   `entregas/plantillas-meta.md`: `recordatorio_cita`, `confirmacion_cita` y
   `aviso_escalado`. Sin la última, hoy el equipo no se entera de un escalado.
   **→ luego, conmigo, si tú lo decides:** `pnpm alta:comprobar <slug>
   --plantilla <movil>`, que manda un centinela de verdad. Son pruebas contra
   producción, así que va con tu «sí» expreso.
9. **Resend · el correo de los escalados** (decisión b).
   - Una cuenta y un dominio tuyo verificado con sus registros DNS.
   - Su DPA.
   - Pegar tú `RESEND_API_KEY` y `EMAIL_REMITENTE` en Vercel.
   - **→ luego, conmigo:** volver a publicar y probarlo.
10. **Supabase · el plan de producción.** Comprobar que el proyecto no está en
    un plan que se pause por inactividad y que tiene copias de seguridad. Es
    una base con datos de pacientes.
11. **La clínica de verdad: la entrevista y sus datos.** Lo que contesta la
    clínica, y qué es público y qué confidencial. **→ luego, conmigo:** la
    ficha (`/alta-clinica`) y `pnpm alta` contra producción. Exige volver a
    poner la `service_role` como variable de Windows un rato, como el 02/10.
12. **Decidir qué se hace con la clínica de prueba** (`prueba-f9`, el usuario
    `cobaltiautomations@gmail.com` y tus dos mensajes). Se puede quedar como
    canario con el número de prueba, o borrarla antes de la primera clínica
    real. **→ luego, conmigo:** el borrado, que es un solo `DELETE` en cascada,
    con tu «sí».

### C · Antes de que acabe 2026

13. **Supabase retira las claves heredadas** (`anon`, `service_role`; fecha
    anunciada «finales de 2026», sin confirmar; pendiente 13). Tú generas las
    claves nuevas en el panel y las pegas en Vercel. **→ luego, conmigo:** el
    cambio de `bot.ts`, que no se toca sin tu confirmación, y las pruebas. La
    ruta de salud lo cantaría el día que pase, pero mejor no esperar a eso.

### D · Higiene de cuentas y del equipo, al cerrar F9

14. **Vercel · el `VERCEL_TOKEN` de esta máquina.** Cuando acabe la fase,
    revócalo o ponle caducidad (Vercel → Account Settings → Tokens), y bórralo
    de las variables de Windows.
15. **`SUPABASE_DB_URL_PROD` en Windows.** Decide si se queda (sirve para
    inventarios de solo lectura y para un `db push` con tu «sí») o se va. Si se
    va, cambia también la contraseña de la base en Supabase.
16. **GitHub · el merge no está bloqueado** (pendiente 2). Con un repositorio
    privado en el plan gratuito no se pueden exigir los checks antes de
    fusionar. O se pasa a un plan que lo permita, o se acepta y se fusiona solo
    con el CI en verde, como hasta ahora.
17. **Vercel · opcionales.** Borrar `WHATSAPP_PHONE_NUMBER_ID`, que no lee
    nadie (§11.8), y poner un límite de gasto en el plan Pro.

---

## 13 · Lo que falta para cerrar F9 (02/10/2026)

F9 termina cuando **un mensaje de WhatsApp real recibe respuesta del bot en
producción**. Todo lo que hay por medio está comprobado (§11) menos una cosa:
que **Meta entregue** el mensaje. Y eso no necesita clínica: con la app
publicada, un «Hola» desde tu móvil (que está en la lista «Para») al número de
prueba llega al webhook.

**A · Sin clínica y sin coste**

1. Comprobar que el registro de Auth está apagado. Necesito un minuto la clave
   `anon` de producción, que es pública por diseño, para leer
   `/auth/v1/settings` (`disable_signup`). Es solo lectura.
2. Pendiente 22: un grupo de concurrencia común en `ci.yml` para las dos
   tiradas que tocan desarrollo (`auditoria-de-fuga` y `pruebas-vivas`), para
   que se esperen entre ramas. Cambio pequeño, con tu visto bueno.
3. Dejar este documento cerrado y su copia de pendientes en `PLAN.md`, en un PR.

Opcionales, también sin coste, pero **fuera del alcance de F9** (§1, LÍMITES):
pendiente 19 (el guardián y el error de `getUser()`), 21 (una línea por
resultado en el registro), 13 (las claves nuevas de Supabase antes de que acabe
2026), 4 (`04-interruptor.spec.ts:189`) y 10 (el `README.md`).

**B · Depende de terceros, todavía sin clínica**

4. Quién es el responsable legal, y su política de privacidad (§12, paso 5).
5. La página `/privacidad` con ese texto: la escribo yo cuando lo haya.
6. Publicar la app de Meta con esa URL y lo que pida Meta (§12, paso 6).
7. Un «Hola» de verdad desde tu móvil al número de prueba: respuesta en el
   móvil y su rastro en la base. Con eso, **F9 cerrada**. Gasta unas pocas
   llamadas a Gemini, que ya pagas.

**C · Depende de la clínica:** ya es la fase siguiente (la primera clínica): su
número, sus plantillas, su alta y la limpieza del modo de prueba (§12, pasos
7–12).

---

## 8 · Pendientes vivos

> Esta lista tiene su copia en `PLAN.md` §11. **Si se toca una, se toca la
> otra.** La copia viva pasa de `ESTADO_F8 §8` a este archivo; aquel se queda
> como registro cerrado de su fase.

1. ~~**🔴 Confirmar el `thought_signature` contra Gemini.**~~ ✅ Cerrado en F8.
2. **🔴 El merge no está bloqueado.** Sin cambios: repositorio privado en plan
   gratuito, sin rulesets. Decisión de producto.
3. ~~**🟡 Los cuatro secretos `SUPABASE_*_DEV`.**~~ ✅ **Cerrado el
   27/09/2026**: puestos y funcionando (§0.4).
4. **🟡 `04-interruptor.spec.ts:189`.** Sin cambios. Abierto hasta que se sepa
   por qué contaba dos apuntes y ahora uno.
5. **⚠️ El punto 1 del alta sigue siendo medio manual.** Lo cierra el punto 6
   de esta fase.
6. ~~**⚠️ La migración 010 no está en producción.**~~ ✅ **Cerrado el
   28/09/2026**: está, con las otras nueve, en el historial y en los objetos;
   `db push --dry-run` no tiene nada que aplicar (§6).
7. **La cuota de Gemini son 20 peticiones al día por modelo.** Punto 5.
8. **El horario del cron depende del plan de Vercel.** Según el traspaso, la
   cuenta es Pro y el cron de cada hora está registrado. Lo compruebo yo cuando
   tenga el token. 🟡 **01/10:** registrado y activo con `0 * * * *` en el
   despliegue que sirve (§11.3); que corra cada hora lo dirá una pasada vista
   en el registro.
9. **F3b**, aparcada, sin cambios.
10. **El `README.md` sigue siendo el de `create-next-app`.** Fuera de esta fase
    salvo que se pida.
11. **`WHATSAPP_CLINICAS` no está en `.env.local`** (de `PLAN.md` §11, «Nuevo en
    F8»). Sin cambios.
12. ~~**🔴 `pruebas-vivas` en rojo por `--linked`.**~~ ✅ **Cerrado el 28/09**:
    verde en el CI del PR #2 (§9.8).
13. **⚠️ El bot depende del secreto JWT heredado y de la clave `anon`**, y
    Supabase retira las claves heredadas a finales de 2026 (§3.4). Nuevo en F9.
    Fuera de esta fase: toca `bot.ts`.
14. ~~**⚠️ Las funciones corren en `iad1`** (§3.3).~~ ✅ **Cerrado el
    01/10/2026**: `cdg1::fra1` en la cabecera de dos rutas de función del
    despliegue `aaefe04` (§11.2). Y el proyecto, también en `fra1` desde el
    01/10 a las 18:38 UTC: ya no depende solo de `vercel.json`.
15. **⚠️ El registro de Auth en producción está abierto** (§3.8, mirado el
    28/09). Nuevo en F9. Punto 5. 🟡 **Decidido el 02/10: apagarlo.** Lo hace
    una persona en el panel (§12, paso 2). Se cierra cuando lo hagas.
16. ~~**🔴 En Meta no hay webhook configurado**~~ ✅ Configurado y verificado
    el 28/09 (§7.2).
17. **🔴 La app de Meta no está publicada**: hasta que lo esté, Meta no entrega
    ningún mensaje real (§7.2). Nuevo en F9. Punto 3; lo hace una persona.
    Lo que pide Meta para publicar (captura del 28/09, sección «Publicar»): la
    **URL de la política de privacidad** (el botón «Publicar» está en gris) y
    revisar el caso de uso «Conecta con los clientes a través de WhatsApp».
18. ~~**🟡 `.env.local` de esta máquina: `SUPABASE_JWT_SECRET` se llama
    `SUPABASE_JWT_SECRET_DEV`**~~ ✅ Renombrada por ti el 28/09; las pruebas
    vivas vuelven a correr (§9.4).
19. **🟡 El guardián tira el error de `getUser()`** (§11.5). Un «no» pasajero
    de Auth con un token válido echó a una prueba a la Agenda y puso rojo el CI
    de `main` (run 36904109929, `04-interruptor.spec.ts:87`). Falla cerrado,
    así que no es de seguridad; en producción sacaría a recepción a la Agenda.
    Nuevo en F9, fuera de su alcance: arreglos propuestos, sin hacer.
20. ~~**🔴 El sitio publicado habla con la Supabase de desarrollo** (§11.6).~~
    ✅ **Arreglado el 01/10/2026** (§11.7): las cuatro variables cambiadas por
    ti, publicado `dpl_H1oZ…`, y la ruta de salud dice `hzanffqxlpcorrucanxd`.
    Nada escrito en desarrollo por producción mientras duró (mapa vacío) y
    ningún paciente afectado. La clave `anon` y el secreto se comprueban con el
    punto 2. ✅ Comprobados el 02/10: `al_dia` (§11.9).
21. **🟡 La escucha en vivo de Vercel pierde líneas** (§11.9). De las dos que
    escribe la ruta de salud de seguido, llega una, y su `rowId` es la marca de
    tiempo en milisegundos. Lo más probable es que dos líneas del mismo
    milisegundo choquen. Para el punto 3: una línea que no aparece no demuestra
    nada. Arreglo posible, sin hacer: que cada ruta escriba su resultado en
    **una** sola línea. Nuevo en F9. **Y más (§11.10):** del procesamiento del
    bot, que corre en `after()`, no llegó **ninguna** línea con la escucha viva.
    Para el bot, lo que manda es la base (`eventos`, `mensajes`).
22. **🟡 El CI no impide dos tiradas a la vez contra desarrollo entre ramas**
    (§11.11). `concurrency.group` va por rama: fusionar con el CI del PR en
    marcha lanza el de `main` encima, y `auditoria-de-fuga` de uno se lleva el
    fixture del otro. Pasó el 02/10 (tres rojos en el PR #3, ninguno del
    código). Arreglo, sin hacer: un grupo común para los dos trabajos que tocan
    desarrollo. Hasta entonces, se fusiona solo con el CI del PR terminado.
    Nuevo en F9.
