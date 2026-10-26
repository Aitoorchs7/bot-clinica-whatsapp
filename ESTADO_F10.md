# ESTADO F10 · La primera clínica de pago

> **Lo que entrega esta fase en una frase:** una clínica que paga, dada de alta
> en producción y contestando a sus pacientes por su número. Cada cosa que hay
> por medio va a nombre de CobaltIA donde la ley lo permite, con su contrato
> firmado y con lo que cuesta medido por clínica.

Fecha: 02/10/2026 · Escrito en la rama `f9-fin` · **Estado: 📝 PLAN. No se ha
ejecutado nada.**

> ⚠️ **Este documento es un plan y nada más.** No se ha tocado producción, ni
> una variable de Vercel, ni Meta, ni ninguna base de datos. Para escribirlo se
> ha leído:
> - el código y los documentos del proyecto;
> - la documentación oficial de los proveedores, a través del agente
>   «investigador», con su fuente y su fecha en §13.
>
> Cada paso marcado 🔴 toca producción y espera tu «sí» expreso, uno a uno.

> **F9 no está cerrada y se cierra aquí dentro.** Le falta que Meta entregue un
> mensaje real, y eso exige publicar la app de Meta. Publicarla es el paso 3.4
> de esta fase.

> **Actualizado el 05/10/2026 con un aviso del asistente de F9:**
> - **No hay página para poner la contraseña** (pendiente 34). Bloquea el alta
>   de cualquier clínica.
> - Ya están hechos el registro de Auth apagado (7.11) y el grupo de
>   concurrencia del CI (pendiente 22), en `f9-fin`, PR #4.
>
> **Este archivo no tiene commit.** Vive en la carpeta que comparten los dos
> asistentes. Su commit irá en una rama propia salida de `main` cuando se
> fusione el PR #4, y nunca dentro de ese PR.

---

## 0 · Cómo leer este documento

| Marca | Significa |
|---|---|
| 👤 | Lo haces **tú**, la persona responsable: decisiones, cuentas, pagos, identidad y claves |
| 🤖 | Lo hace **el agente** |
| 🏥 | Lo hace o lo da **la clínica** |
| 🏛 | Depende de **un tercero**: el asesor, Meta, Google… |
| 💶 | **Cuesta dinero**, y se dice quién lo paga. La cifra solo cuando hay fuente |
| 🔴 | **Toca producción.** Lleva una lectura antes, otra después y la forma de deshacerlo. Espera un «sí» |
| ⚪ | **No comprobado.** Nunca se lee como «está bien» |

Los pasos van numerados por bloque (`5.4` es el paso 4 del bloque 5). **§2 los
pone en el orden en que se ejecutan**, que no es el de los bloques.

Cuando un paso es tuyo y hay que teclear algo, va la orden exacta. Las
claves **nunca** pasan por el chat ni por una terminal: se ponen como variable
de usuario de Windows desde su ventana y se borran al terminar (§7.2).

---

## 1 · El contrato de la fase

**ENTREGA**

1. Las cuentas inventariadas, a nombre de CobaltIA en lo que se pueda sin
   forma jurídica, y un plan escrito para el resto (bloque 1).
2. La lista para el asesor (bloque 2). Las decisiones legales son suyas y
   tuyas, no del agente.
3. El canal de Meta decidido y montado para el número de la clínica: app
   publicada, número registrado y tres plantillas aprobadas (bloque 3).
4. La entrevista a la clínica, con lo que el guion actual no recoge, y una hoja
   en su idioma (bloque 4 y `entregas/hoja-para-la-clinica.md`).
5. El alta en producción con `pnpm alta`, el par en `WHATSAPP_CLINICAS`, la
   ruta de salud en `al_dia` y un primer mensaje real contestado (bloque 5).
6. El modo de prueba resuelto: se conserva como control o se borra, con su
   comprobación (bloque 6).
7. Lo que hace falta antes del primer paciente: copias de seguridad, gasto
   vigilado, correo de escalados y los pendientes que afectan a una clínica
   real (bloque 7).
8. El coste medido por clínica y el conteo mensual preparado para cobrar el
   extra, sin fijar su cifra (bloque 8).

**PRUEBA**

- Cada paso 🔴 lleva una lectura **antes**, otra **después** y cómo se deshace.
- Después de cada cambio de cuenta o de clave, la comprobación de **ese
  servicio**, no solo la de Supabase (§3.5). Hoy `al_dia` solo demuestra
  Supabase y el mapa de números.
- Todo cero se cuenta con una segunda credencial y con un control que **sí**
  encuentre algo. Si no, ese cero no vale.
- Todo cambio de código, en un PR con la suite **dos veces con el mismo número**,
  `tsc` y `eslint` en 0, visto en rojo donde debe y con el CI del PR terminado
  antes de fusionar (pendiente 22).

**LÍMITES**

- Nada en producción sin un «sí» expreso, paso a paso: la base de datos, las
  variables de Vercel, Meta y fusionar en `main`, que publica.
- Nunca se lee `.env` ni `.env.local`, que apunta a **desarrollo**.
- `service_role` nunca entra en Vercel ni en el camino del bot. Solo en el alta,
  en esta máquina y durante el alta.
- Ninguna prueba contra producción sin decisión expresa (5.9 y 5.10). Una sola
  tirada a la vez contra desarrollo, contando el CI.
- No se toca sin tu confirmación lo que `.claude/CLAUDE.md` protege: las
  políticas RLS, los bloques de prompt, `sin_solape` y los tres clientes de
  Supabase. Este plan **propone** cambios en dos de esas cosas: el bloque 50,
  para el permiso de los pacientes (3.11), y `bot.ts`, por las claves de 2026
  (7.10). Cada uno lleva su confirmación aparte.
- Nada de «Fuera de alcance». En particular, cancelar por WhatsApp sigue
  escalando y no cancela.
- **No se inventa ninguna cifra**: ni precios a la clínica, ni el extra por
  mensaje, ni tarifas de Meta para España sin fuente.

**SUPUESTOS**

- Producción es `hzanffqxlpcorrucanxd`, en **plan Free** (dicho por ti el
  02/10). Desarrollo es `ggalkkeobyxpodbzlwzj`.
- Gemini, en **prepago** (dicho por ti el 02/10).
- **No hay dominio** de CobaltIA (dicho por ti el 02/10).
- El portafolio comercial de Meta está **a tu nombre personal** (dicho por ti el
  02/10).
- La clínica todavía no existe: todo lo que depende de ella queda abierto.
- Lo que no está aquí está en §12.2, «Lo que no sé», con dónde mirarlo.

**FALLOS** — lo que puede salir mal y cómo se verá

- **Un `al_dia` que no mira lo que se ha cambiado.** Cambiar el token de Meta o
  la clave de Deepgram deja la ruta en `al_dia` aunque la clave nueva no
  funcione, porque no la prueba. Por eso 7.1 va antes que cualquier cambio de
  cuenta.
- **Una WABA creada en el portafolio equivocado.** Meta no permite moverla
  después [M4]. Si se crea a tu nombre y luego CobaltIA es una SL, hay que
  empezar de cero con el número.
- **Supabase Free en producción.** Se pausa tras unos 7 días de poca actividad
  y no tiene copias automáticas [S1]. Una clínica que paga no puede estar ahí.
- **Gemini en prepago con el saldo a 0.** Google devuelve 402 a todas las claves
  del proyecto [G2] y el bot se calla para **todas** las clínicas, sin respaldo
  (§9.2). La ruta de salud lo clasifica hoy como temporal (§9.2).
- **Los precios de Meta cambiaron ayer.** Hay una página oficial que dice que
  desde el 01/10/2026 se cobran los mensajes de servicio, y otra que no lo dice
  [M6]. Prometer un precio a la clínica sin mirarlo sería prometer a ciegas.
- **Lo legal se queda en el plan.** Sin asesor no hay contrato de encargo, y sin
  contrato no debería entrar el primer dato de un paciente.
- **Un alta cuyos usuarios no pueden entrar.** `pnpm alta` saca un enlace de
  recuperación (`alta-clinica.mjs:483-494`) que hoy no atiende ninguna página
  del sitio. El propietario nunca pone su contraseña (pendiente 34). Por eso el
  34 es un requisito previo de 5.4.
- **Cobrar antes del alta censal.** Cobrar o facturar ya es empezar la actividad,
  y el alta (modelo 036) va antes [L1]. «Facturar a tu nombre como CobaltIA»
  solo existe después del 036 (§4.4).

---

## 2 · El orden

La tabla maestra. Cada fila remite a su paso en los bloques de abajo.

### Etapa 0 · Ya, sin empresa y sin clínica · sin coste

| Paso | Qué | Quién | 💶 | Depende de | Cómo se comprueba |
|---|---|---|---|---|---|
| 1.1 | Completar el inventario (§3.2) | 👤 mira, 🤖 anota | — | — | No queda ningún ⚪ en la tabla |
| 1.2 | Verificación en dos pasos en todas las cuentas | 👤 | — | — | Lista marcada por ti, servicio a servicio |
| 1.4 | El correo de CobaltIA como segundo administrador donde se pueda | 👤 | — | — | La cuenta aparece como miembro |
| 3.1 | Mirar en WhatsApp Manager el método de pago, si cobran los mensajes de servicio desde el 01/10 y las tarifas de España | 👤 | — | — | Captura o CSV de tarifas |
| 3.2 | Preguntar a Meta si vale el modelo (a) | 👤 | — | — | Respuesta escrita de Meta |
| 2.1 | Elegir asesor y darle la lista del bloque 2 | 👤 | 💶 el asesor | — | Fecha de la primera reunión |
| 7.1 | La ruta de salud mira también Meta, Deepgram y el saldo de Gemini | 🤖 PR | — | — | Pruebas en rojo con cada credencial mala |
| 7.2 | Deepgram: endpoint UE y sin conservar audio | 🤖 PR | — | D8 | Prueba de la URL, vista en rojo |
| 7.3 | Si Gemini falla, el paciente recibe un mensaje con el teléfono | 🤖 PR | — | — | Prueba con el modelo lanzando 429 y 402 |
| 7.4 | El fallo del historial agrupado (`procesar.ts:298`) | 🤖 PR | — | — | Prueba con otra conversación intercalada |
| **34** | **La página para poner la contraseña.** Requisito previo del alta (§7.2) | 🤖 el asistente de F9, en su propia rama | — | PR #4 fusionado | Revisión de seguridad y las pruebas de §7.2 (5.6) |
| 7.10 | Pendientes 19 y 21. El 22 ya está en el CI (`0f468a9`, PR #4): falta ver dos tiradas esperándose | 🤖 PR | — | — | Su prueba de cada uno |
| 8.2 | El conteo mensual (migración 011), en desarrollo | 🤖 PR | — | D7 · tu confirmación | Pruebas de RLS de la tabla nueva |
| 8.3 | Coste por modelo y precios con fecha | 🤖 PR | — | — | Prueba que cruza el 31/12 y el 1/1 |
| 7.11 | ✅ **Hecho el 02/10** por el asistente de F9 (`6956181`): `disable_signup: true` en producción | — | — | — | — |

### Etapa 1 · Ya, con gasto

| Paso | Qué | Quién | 💶 | Depende de | Cómo se comprueba |
|---|---|---|---|---|---|
| 7.6 | Supabase de producción a **Pro** | 👤 | 💶 desde 25 USD/mes [S1] | — | Billing dice Pro. Copias diarias visibles. `al_dia` |
| 7.7 | Alertas de gasto en Google, Vercel y Deepgram, y saldo de Gemini con margen | 👤 | 💶 el saldo | — | Cada alerta, vista en su panel |
| 7.8 | La clave de Gemini, restringida a la Gemini API | 👤 | — | — | `/api/cron/salud` → 200 |
| 7.9a | Comprar el dominio de CobaltIA | 👤 | 💶 el dominio | — | Lo resuelve el DNS |

### Etapa 2 · Con el asesor

| Paso | Qué | Quién | 💶 | Depende de | Cómo se comprueba |
|---|---|---|---|---|---|
| 2.2 | **D1, la forma jurídica.** Cambia cuánto hay que mover en el bloque 1 | 👤🏛 | 💶 alta, cuotas | 2.1 | Decisión por escrito |
| 2.3 | La política de privacidad del producto (la de CobaltIA, no la de la clínica) | 🏛 redacta, 👤 aprueba | 💶 asesor | 2.2 | Texto aprobado |
| 2.4 | Modelo de contrato de encargo, con su anexo de subencargados | 🏛 | 💶 asesor | 2.2 | Modelo aprobado |
| 2.5 | Modelo de contrato de servicio: precio, cupo, extra y baja | 🏛👤 | 💶 asesor | 2.2 | Modelo aprobado |
| 2.6 | El registro de actividades de CobaltIA como encargada | 🏛👤 | — | 2.2 | Documento |

### Etapa 3 · Al constituir CobaltIA

| Paso | Qué | Quién | 💶 | Depende de | Cómo se comprueba |
|---|---|---|---|---|---|
| 1.5 | Los datos de facturación de cada proveedor, a nombre de CobaltIA | 👤 | — | D1 constituida | La siguiente factura de cada uno |
| 1.6 | **Solo si es una SL:** los traspasos de cuentas (§3.4) | 👤🤖 | depende | D1 = SL | §3.5, servicio a servicio |
| 2.7 | Los DPA a nombre de CobaltIA (el de Deepgram se pide) | 👤 | — | D1 | Copia guardada de cada uno |
| 3.5 | La verificación del negocio en Meta | 👤🏛 | — | D1 | «Verificado» en el portafolio |
| 7.9b | Resend: cuenta, dominio verificado, DPA y las dos variables | 👤 pega, 🤖 publica 🔴 | 💶 gratis hasta 3.000/mes [R2] | 7.9a, D1 | Un escalado del control llega por correo |

### Etapa 4 · Meta, todavía sin clínica

| Paso | Qué | Quién | 💶 | Depende de | Cómo se comprueba |
|---|---|---|---|---|---|
| 3.3 | **D2, el modelo de Meta**, (a) o (b) | 👤 | — | 3.2, D1 | Decisión por escrito |
| 3.4 | 🔴 **Publicar la app.** Con esto se cierra F9 | 👤 | — | 2.3 publicada en una URL | «Hola» desde tu móvil al número de prueba → respuesta y rastro en la base |
| 3.6 | Solo con (b): hacerse Tech Provider | 👤🤖🏛 | — | 3.5 | Acceso avanzado concedido |
| 3.7 | 🔴 El token de usuario del sistema | 👤 pega, 🤖 publica | — | 7.1 | La ruta de salud ampliada dice que el número contesta |

### Etapa 5 · Con la clínica

| Paso | Qué | Quién | 💶 | Depende de | Cómo se comprueba |
|---|---|---|---|---|---|
| 4.1 | Mandar la hoja (`entregas/hoja-para-la-clinica.md`) | 👤 | — | — | — |
| 4.2 | La entrevista (`/alta-clinica`) y lo que añade §6 | 🤖🏥 | — | — | La ficha valida con 0 errores |
| 4.3 | La clínica aprueba por escrito las FAQ, el mensaje de urgencia y qué es público | 🏥 | — | 4.2 | Documento firmado o correo |
| 4.4 | Contratos firmados: servicio y encargo | 🏥👤 | 💶 lo cobra CobaltIA | 2.4, 2.5, D1 | Copia firmada |
| 3.8 | **D3, el número**, y **D4, almacenamiento en Alemania.** Registrar el número | 👤🏥 🔴 | — | D2, 4.4 | Número con nombre visible aprobado |
| 3.9 | El método de pago de la WABA | 👤 en (a) · 🏥 en (b) | 💶 Meta | 3.8 | Visible en WhatsApp Manager |
| 3.10 | Las tres plantillas, en la WABA del número | 👤 | — | 3.8 | Aprobadas (hasta 24 h [M10]) |
| 3.11 | **D14, el permiso de los pacientes:** texto y cambio en el bot | 👤🏛, 🤖 PR | — | asesor, tu confirmación del bloque 50 | Prueba: la cita deja `consentimiento_en` |

### Etapa 6 · El alta técnica

**Requisito previo: el pendiente 34, cerrado y publicado.** Sin él, 5.4 crea
usuarios que no pueden entrar en su panel.

Del 5.1 al 5.12, en orden (§7). Las piezas que tocan producción:
- **5.4**, el alta;
- **5.7**, el mapa y volver a publicar;
- **5.9**, el acta, opcional;
- **5.10**, el centinela.

**El número no se anuncia a los pacientes hasta que 5.8 dice `al_dia` y 5.11
sale bien** (§11.4: un mensaje que llega antes se pierde sin rastro).

### Etapa 7 · Dejar limpio el modo de prueba

Del 6.1 al 6.4 (§8), **después** de que la clínica real esté en `al_dia` y haya
contestado un mensaje real.

### Etapa 8 · Antes del primer paciente

7.12, la lista final de comprobación, y 8.4, los precios puestos en producción.

### Lo que se repite

| Cuándo | Qué |
|---|---|
| Cada día | Las cuatro crons de siempre. Los recordatorios pasan cada hora; la retención, la salud del modelo y la de las clínicas (06:15 UTC), una vez al día |
| Cada mes, el día 1 | El cierre del consumo (8.5) |
| **Antes del 01/12/2026** | Las claves nuevas de Supabase (pendiente 13, 7.10). Supabase dice «finales de 2026», sin día; la fecha es propia, para no apurarla |
| **El 1/1/2027** | Gemini dobla precio [G8]. Con 8.3 hecho no hay que hacer nada; sin él, cambiar las tarifas ese día |

---

## 3 · Bloque 1 · Las cuentas

### 3.1 · Contrato

**ENTREGA.** El inventario sin ⚪. Lo que se puede poner a nombre de CobaltIA
sin forma jurídica, hecho. El resto, escrito para el día de la constitución,
con lo que cambia en cada servicio y cómo se comprueba.

**PRUEBA.** Después de cada cambio, la comprobación de §3.5 para **ese**
servicio. `al_dia` por sí solo no basta.

**LÍMITES.**
- Ningún traspaso antes de saber la forma jurídica (D1), para no mover dos
  veces.
- Ningún valor secreto por el chat.
- El nombre del portafolio de Meta no se cambia hasta D1 (§3.3).

**SUPUESTOS.** Los de §1, más los ⚪ de la tabla de §3.2.

**FALLOS.**
- Un traspaso de Supabase que cambie claves en silencio. La documentación no
  dice si cambian [S2], y por eso va seguido de `al_dia`.
- Un traspaso de Vercel que deje fuera las integraciones, que no se copian
  [V1].
- Un `VERCEL_TOKEN` que deja de valer: está limitado al proyecto y al equipo de
  hoy (memoria `vercel-proyecto-y-token`).

### 3.2 · El inventario de hoy

| Servicio | Titular hoy | Plan | Quién paga | De dónde sale | Valores secretos que cuelgan de ahí |
|---|---|---|---|---|---|
| **Vercel** | Tú. Equipo `apolo4team` (`team_74Kv…`), proyecto `bot-clinica-whatsapp` | **Pro** | ⚪ tu tarjeta | API, 01–02/10 | 12 variables (ESTADO_F9 §11.4) y `VERCEL_TOKEN` en Windows |
| **Supabase** | Tú. Organización ⚪ (nombre). Desarrollo y producción | **Free** (tú, 02/10) | — | Tú | URL, `anon` y secreto JWT (en Vercel). `service_role` (fuera de Vercel). La contraseña de la base (`SUPABASE_DB_URL_PROD` en Windows) |
| **Google AI Studio / Cloud** | ⚪ tu Gmail | Facturación **prepago** (tú, 02/10); «My Billing Account» (tú, 01/10) | ⚪ tu tarjeta | Tú | `GOOGLE_AI_API_KEY`. ⚪ si está restringida |
| **Meta** | Portafolio **a tu nombre** (tú, 02/10). App ⚪ (id). WABA de prueba `887494041017015`. Número de prueba +1 555 185 0806 (`1143963372124362`) | App **sin publicar** | ⚪ sin método de pago | ESTADO_F9 §7.2 y §11.8 | `WHATSAPP_TOKEN` (⚪ si es de usuario del sistema, F9 §12 paso 4), `META_APP_SECRET` y `WHATSAPP_VERIFY_TOKEN` |
| **Deepgram** | ⚪ | ⚪ | ⚪ | — | `DEEPGRAM_API_KEY` |
| **GitHub** | Tú (`Aitoorchs7`), repositorio privado | Gratuito | — | `gh`, 27/09 | 5 secretos (`SUPABASE_*_DEV` y `SUPABASE_DB_URL_DEV`) y la variable `RLS_VIVA` |
| **Resend** | No existe | — | — | — | `RESEND_API_KEY` y `EMAIL_REMITENTE`, sin poner |
| **Correo** | `cobaltiautomations@gmail.com` (Gmail) | — | — | F9 §11.8 | Es también el usuario del panel de la clínica de prueba |
| **Dominio** | **No hay** (tú, 02/10) | — | — | — | — |

### 3.3 · Lo que se puede hacer ya, y lo que no

**El principio:** sin forma jurídica, «CobaltIA» es solo un nombre. El titular
legal de cada cuenta sigue siendo la persona, con su nombre y su NIF. Ningún
proveedor de los leídos trata expresamente a una persona física como cliente de
su DPA. Sus condiciones hablan de una «organización» o «entidad» y de quien tiene
«autoridad para obligarla» [G6][D4][R1][V3]. Qué significa eso para ti lo dice
el asesor, no este plan.

| Ya, sin entidad | Bloqueado hasta constituir |
|---|---|
| Verificación en dos pasos en todo (1.2) | Facturas de los proveedores a nombre de CobaltIA (1.5) |
| El correo de CobaltIA como segundo administrador (1.4) | DPA aceptados por CobaltIA como entidad (2.7) |
| Renombrar a «CobaltIA» el **nombre** del equipo de Vercel (el Team ID no cambia [V1]) y el del proyecto de Deepgram | La verificación del negocio en Meta: los datos «deben coincidir exactamente con los de la entidad legal» [M19] |
| Alertas de gasto (7.7) | Tech Provider, que exige negocio verificado [M2] |
| | Facturar a la clínica: lo dice el asesor (bloque 2, §4.4) |

**No conviene, aunque se pueda:**
- **El slug del equipo de Vercel.** Forma parte de las URL generadas [V1].
- **El nombre del portafolio de Meta**, hasta D1. Si se verifica, tiene que
  coincidir con la entidad.

**Lo que cambia con D1, y por qué importa decidirlo antes de mover nada:**

- **Si CobaltIA es autónomo:** el titular sigue siendo la misma persona. No se
  traspasa nada; en cada proveedor solo cambian los datos de facturación (tu
  NIF, con el nombre comercial si el asesor lo admite). El portafolio de Meta es
  el tuyo de siempre, y se verifica con tus datos.
- **Si es una SL:** el titular es otro, y entonces hay que traspasar en Vercel,
  Supabase, Google, Deepgram, GitHub y Meta (§3.4). En Meta, además, **una WABA
  no se puede mover a otro portafolio** [M4]. Si la WABA de la clínica se crea
  antes en el portafolio personal, luego hay que mover el número. Ese camino
  solo está documentado para Solution Partners [M20] y no está confirmado para
  una app propia.
  → **La WABA de la primera clínica no se crea hasta saber D1.**

### 3.4 · Los traspasos, servicio a servicio (solo si es una SL)

| Servicio | Cómo, sin corte | Qué cambia | Qué no se traspasa o no se sabe |
|---|---|---|---|
| **Vercel** | Traspasar el proyecto al equipo de la SL, con el método de pago ya cargado en el destino. «Cero tiempo de inactividad» [V1] | Las URL generadas que llevan el slug. El `VERCEL_TOKEN`, que hay que crear de nuevo en el equipo nuevo | Las integraciones, los registros y el uso. ⚪ Si las variables sensitive se copian tal cual: la página dice «copiadas» sin distinguir. Durante 10 s a 10 min no se puede publicar [V1] |
| **Supabase** | Traspasar el proyecto a la organización de la SL. **Antes**, desconectar la integración de GitHub si la hay [S2] | ⚪ La documentación no dice si cambian la URL, las claves o el secreto JWT | El plan Free admite como mucho 2 proyectos por organización [S2] |
| **Google** | Cambiar la cuenta de facturación del proyecto: «no debería haber interrupción»; puede tardar hasta 2 días [G5] | Al cambiar de cuenta cambian el nivel y los límites, y el gasto acumulado vuelve a 0 [G2] | ⚪ Qué pasa con el saldo prepago de la cuenta vieja |
| **Deepgram** | Invitar a la cuenta nueva como Owner y retirar la vieja. El traspaso de propiedad no está documentado [D5] | Nada, si la clave no se toca | El saldo entre proyectos solo lo mueve Soporte [D5] |
| **GitHub** | Pasar el repositorio a una organización. Se conservan los secretos y hay redirecciones [H1] | La URL del repositorio, con redirección | ⚪ La variable `RLS_VIVA` y el historial del CI: la página no los menciona |
| **Meta** | La app sí se puede pasar a otro portafolio, y **no se puede deshacer** [M17] | — | **La WABA no se puede pasar** [M4] |

### 3.5 · La comprobación después de cada cambio

**`al_dia` solo demuestra tres cosas:**
- que Supabase acepta el token del bot;
- que el mapa `WHATSAPP_CLINICAS` está bien;
- que la fila de cada clínica cuadra (`clinicas.ts:115`, ESTADO_F9 §11.9).

No prueba Gemini, ni Meta, ni Deepgram. Por eso cada servicio tiene la suya:

| Si cambia… | Se comprueba con | Lanzado por |
|---|---|---|
| Supabase (claves, traspaso, plan) | `/api/cron/clinicas` → `al_dia` | 🤖 `POST /v1/projects/{id}/crons/run` (memoria `vercel-proyecto-y-token`), con tu «sí» |
| Gemini (clave, facturación) | `/api/cron/salud` → 200, los dos modelos `ok` | 🤖 el mismo `crons/run`. Gasta dos llamadas |
| Meta (token, número) | **Hoy nada.** Después de 7.1, `/api/cron/clinicas` ampliada | 🤖 |
| Deepgram (clave) | **Hoy nada.** Después de 7.1 | 🤖 |
| Vercel (traspaso) | Despliegue READY en el equipo nuevo, las cuatro crons activas, `X-Vercel-Id` con `fra1` y las dos rutas de arriba | 🤖 API de Vercel (token nuevo) |
| GitHub (traspaso) | Un PR de prueba con el CI verde entero y `RLS_VIVA` todavía puesta | 🤖 `gh` |

---

## 4 · Bloque 2 · Lo legal, como lista para el asesor

> **Esto no lo decide el agente.** Es lo que el asesor tiene que ver, con las
> fuentes. Donde pone «⚪», no se ha podido confirmar.

### 4.1 · Contrato

**ENTREGA.**
- La lista de abajo.
- Las respuestas del asesor, que se anotan en este archivo.
- Los cinco documentos de §4.3, aprobados.

**PRUEBA.** Cada documento existe, está aprobado por el asesor y su fecha
queda aquí.

**LÍMITES.** El agente no redacta un contrato como si fuera definitivo ni
interpreta una norma como si fuera la respuesta.

**SUPUESTOS.**
- La clínica es la responsable del tratamiento.
- CobaltIA es su encargada.
- Los proveedores son subencargados de CobaltIA.

**FALLOS.**
- Firmar el encargo con una lista de subencargados que no cuadra con lo que el
  código usa de verdad: §4.2 sale del código, no de memoria.
- Prometer en el contrato «datos solo en la UE», que hoy **no es cierto** (§4.2).

### 4.2 · Dónde se trata cada dato

Sale del código (qué se manda a cada proveedor) y de sus condiciones [§13].

| Proveedor | Qué recibe del paciente | Dónde | Retención y entrenamiento | DPA |
|---|---|---|---|---|
| **Supabase** | Todo: ficha, citas y mensajes (90 días) | `eu-central-1` (Fráncfort): los datos se guardan y se tratan «principalmente» ahí, pero pueden tratarse «en cualquier lugar» [S3] | No entrena sin consentimiento escrito [S3] | Incorporado a las condiciones. Cláusulas tipo. Aviso de subencargados con 30 días [S3] |
| **Vercel** | Cada mensaje pasa por la función | Funciones en `fra1` (ESTADO_F9 §11.2). Instalaciones principales en EE. UU.; la red tiene puntos en 51 países [V3]. ⚪ Si una conmutación saca la función de la UE | Registros de 1 día en Pro [V4]. Pro de pago no entrena salvo que se active [V3] | Incorporado en Pro. Cláusulas tipo y Marco UE-EE. UU. [V3] |
| **Google (Gemini API)** | El texto del paciente y el prompt | **Sin residencia en la UE**: «en cualquier país» [G1]. La UE solo con Vertex AI, según personal de Google en el foro, no en la documentación [G9] | 55 días para detectar abusos [G7]. Pagando, **no** se usa para mejorar productos [G1] | Por referencia. Cláusulas tipo y Marco UE-EE. UU. Aviso de subencargados con 30 días [G6] |
| **Deepgram** | La nota de voz | Hoy `api.deepgram.com` (`audio.ts:133`), servidores en EE. UU. Existe `api.eu.deepgram.com`, sin coste extra [D2] | ⚠️ **Por defecto conserva el audio y la transcripción para mejorar sus modelos.** Con `mip_opt_out=true`, solo mientras se procesa [D1]. **Hoy no se manda** (`audio.ts:120-133`) | **A petición**, a security@deepgram.com [D4] |
| **Meta** | Todo lo que va por WhatsApp | Sus centros de datos. Opcional: almacenamiento en reposo en **Alemania** (DE), que se activa antes de registrar el número [M12] | 30 días como máximo [M14] | Condiciones de tratamiento de WhatsApp (22/08/2025) y anexo de transferencias, con WhatsApp Ireland [M14] |
| **Resend** (cuando exista) | El teléfono del paciente y el motivo, nunca lo que escribió (`escalado.ts`) | **Siempre EE. UU.**; la región UE es solo de envío [R1] | 30 días [R1] | Firmado de antemano en toda cuenta. Cláusulas tipo y Marco UE-EE. UU. [R1] |
| **GitHub** | Nada real: solo datos de prueba inventados | — | — | Para todos los clientes [H2] |

**Lo que se le pide al asesor que valore con esta tabla:**
1. ¿Basta el Marco UE-EE. UU. y las cláusulas tipo para Google, Vercel, Resend y
   Deepgram, o hay que ir a Vertex AI en la UE (D9) y al endpoint UE de Deepgram
   (D8)?
2. Deepgram conserva el audio por defecto. Con `mip_opt_out=true` deja de
   hacerlo. **El agente recomienda mandarlo siempre (7.2) antes del primer
   paciente**, se decida lo que se decida sobre la región.
3. Si los mensajes pueden contener datos de salud (art. 9) aunque la ficha no
   los guarde, y qué exige eso: ¿evaluación de impacto? ¿delegado de
   protección de datos de la clínica o del encargado?

### 4.3 · Los documentos

| Paso | Documento | De quién | Estado | Para qué hace falta |
|---|---|---|---|---|
| 2.4 | **Contrato de encargo** (art. 28.3), con autorización de subencargados y anexo con la tabla de §4.2. Guía de la AEPD [A1] | CobaltIA ↔ clínica | ❌ | Antes del primer dato de un paciente |
| 2.7 | **DPA de cada proveedor**, a nombre de CobaltIA | CobaltIA ↔ proveedor | ❌ (los incorporados ya rigen a tu nombre personal) | El anexo del 2.4 |
| 2.6 | **Registro de actividades** de CobaltIA como encargada (art. 30.2) | CobaltIA | ❌ | Obligación propia |
| 2.3 | **Política de privacidad del producto**: la de CobaltIA, no la de la clínica | CobaltIA | ❌ | Meta la pide para publicar la app (3.4) |
| 2.5 | **Contrato de servicio**: pago único, cuota, mensajes incluidos, extra (cifra sin fijar), mejoras aparte, duración, baja y devolución de los datos | CobaltIA ↔ clínica | ❌ | Antes de cobrar |

La política de privacidad **de cada clínica es suya**. El bot la enlaza
(`config.politica_privacidad`, obligatoria en la ficha), y el asesor dirá si
tiene que mencionar el canal de WhatsApp y a CobaltIA como encargada.

### 4.4 · Lo fiscal y la forma jurídica

> **No hay atajo.** Lo que sigue son hechos con su fuente [L1–L9]. Lo que
> significan en tu caso lo dice el asesor.

**Lo que dicen las fuentes:**

1. **El alta censal va antes de empezar, y cobrar o facturar ya es empezar.**
   - La AEAT: el alta «se deberá presentar con anterioridad al inicio de las
     correspondientes actividades», y la actividad empieza «desde el momento
     que se realicen cualesquiera entregas, prestaciones [...] se efectúen
     cobros o pagos» [L1].
   - En el IVA cuentan también los **actos preparatorios**: adquirir bienes o
     servicios con la intención de dedicarlos a la actividad [L1].
   - **Solo con el modelo 036.** El 037 se suprimió el 03/02/2025 [L2].
2. **«Facturar a tu nombre actuando como CobaltIA» solo existe después del
   036.**
   - La factura lleva por obligación tu nombre y apellidos, tu NIF y tu
     domicilio [L3].
   - «CobaltIA» puede ir **al lado**, como nombre comercial, nunca en su lugar.
     La propia aplicación de facturación de la AEAT lo prevé para personas
     físicas [L3].
   - Antes del 036 no hay forma de facturar ni de cobrar sin incumplir el
     plazo del alta. Esto es una deducción, no una cita: no se ha encontrado un
     precepto que anule una factura emitida sin alta.
3. **El RETA es para quien hace una actividad «de forma habitual, personal y
   directa»**, y el alta puede ir hasta 60 días antes de empezar [L4].
   **Ninguna fuente oficial consultada fija un umbral de ingresos.** El
   criterio del salario mínimo es jurisprudencia y está discutido. No se cuenta
   como una salida.
4. **El nombre comercial no hay que registrarlo para usarlo**, pero el derecho
   exclusivo solo nace con el registro en la OEPM [L5]. ⚪ No se ha mirado si
   «CobaltIA» choca con una marca ya registrada.
5. **La SL:**
   - El capital mínimo es de **1 €** (art. 4.1 LSC, tras la Ley 18/2022), con
     reglas de reserva hasta los 3.000 € [L6].
   - Un contrato firmado «en nombre de la sociedad antes de su inscripción»
     hace responder **solidariamente a quien lo firmó**, salvo que quede
     condicionado a la inscripción y a que la sociedad lo asuma (art. 36 LSC).
     Inscrita, la sociedad queda obligada por lo que acepte en tres meses
     (art. 38) [L6].
   - Si se firma a título personal, como autónomo, la ley no dice cómo pasa
     luego a la SL: depende del caso.
6. **Verifactu**, para quien tributa en el IRPF: hasta antes del 01/07/2027
   [L7]. La **factura electrónica obligatoria entre empresas** (RD 238/2026)
   corre 24 meses desde una orden ministerial. ⚪ No se sabe si ya se ha
   publicado [L7].
7. **LSSI, art. 10:** quien presta el servicio publica su nombre, su NIF, su
   domicilio y un correo [L8]. **Con CobaltIA como persona física, eso es tu
   NIF y tu domicilio en la web y en la política de privacidad** de 3.4. Es
   algo que tienes que saber antes de publicar la app.
8. **RGPD:**
   - El registro de actividades: exento por debajo de 250 trabajadores salvo
     riesgo, tratamiento no ocasional o categorías especiales, y la AEPD avisa
     de que en la práctica casi todos están obligados [L9].
   - El delegado de protección de datos: **la clínica lo tiene que tener** como
     centro sanitario (art. 34 LOPDGDD), salvo la excepción del profesional que
     ejerce a título individual. CobaltIA, solo si encaja en el art. 37.1 del
     RGPD [L9].
9. **Reglamento de IA, art. 50:** se aplica **desde el 02/08/2026**. La
   obligación de informar en la primera interacción es **del proveedor** [L10].
   El bot ya lo hace (bloque 05).

**Qué se puede hacer ya, y qué no:**

| Ya | Solo después del 036 (o de inscribir la SL) |
|---|---|
| Las cuentas, el inventario, la seguridad y los arreglos de código (Etapa 0) | **Cobrar** la instalación, la cuota o el extra, y **facturar** |
| Hablar con clínicas. ⚪ Que enviar una propuesta no sea «inicio de actividad» no aparece en las fuentes: que lo confirme el asesor | Firmar el contrato de servicio a nombre de CobaltIA |
| Comprar el dominio, que puede contar como acto preparatorio en el IVA (pregunta 1 de abajo) | Los datos de facturación de los proveedores a nombre de CobaltIA (1.5) |

**Preguntas para el asesor:**

1. Los gastos ya hechos para CobaltIA (Vercel Pro, Gemini), ¿cuentan como
   inicio de actividad en el IVA? Si es así, ¿el alta va ya con retraso?
2. ¿RETA desde el primer cliente aunque los ingresos sean bajos?
3. **D1:** ¿autónomo o SL, sabiendo lo que cambia en las cuentas (§3.3)? Si es
   SL, ¿se firma con la cláusula del art. 36 o se espera a la escritura?
4. ¿Qué IVA y qué retención llevan las tres partes del precio? ¿Cómo encajan
   Verifactu y la factura electrónica?
5. ¿CobaltIA es encargada del tratamiento **y** «proveedor» del art. 50, con la
   clínica como responsable del despliegue?
6. ¿Necesita CobaltIA registro de actividades o delegado de protección de
   datos? ¿Y la clínica concreta es centro sanitario o profesional individual?
7. ¿Registrar «CobaltIA» como nombre comercial o como marca antes de usarlo?
8. Con autónomo, la LSSI obliga a publicar tu NIF y tu domicilio. ¿Hay forma
   aceptable de cumplirla sin el domicilio particular?

---

## 5 · Bloque 3 · WhatsApp y Meta

### 5.1 · Contrato

**ENTREGA.**
- D2 (el modelo) y D3 (el número) decididos, con sus consecuencias por escrito.
- La app publicada.
- El número de la clínica registrado y con método de pago.
- Las tres plantillas aprobadas.
- El permiso de los pacientes resuelto.
- F9 cerrada.

**PRUEBA.**
- La app en «Live».
- Un «Hola» real que llega y se contesta.
- Las plantillas en «Active».
- El centinela leído en un móvil (5.10).

**LÍMITES.**
- Nada se contesta de memoria: todo con fuente en §13.
- **D3 queda abierta hasta que exista la clínica.**

**SUPUESTOS.** Graph API v25.0 clavada (`config.ts:29`). Una sola app para
todas las clínicas.

**FALLOS.**
- Una WABA en el portafolio equivocado (§3.3).
- Las plantillas recategorizadas como marketing [M10].
- Un número que recibe mensajes antes de estar en el mapa (§11.4).
- Recordatorios a pacientes sin su permiso (3.11).

### 5.2 · D2 · En qué cuenta vive el número

| | **(a) En la WABA de CobaltIA** | **(b) En la WABA de la clínica, compartida con CobaltIA** |
|---|---|---|
| **Lo que exige a CobaltIA** | Nada especial: es «Direct Developer», sin App Review ni acceso avanzado [M3] | **Ser Tech Provider:** negocio verificado, App Review con dos vídeos y acceso avanzado a `whatsapp_business_messaging` y `whatsapp_business_management` [M2][M3] |
| **Quién paga a Meta** | CobaltIA. **Cuadra** con el modelo de negocio | **La clínica**, con su propio método de pago. Las líneas de crédito son solo de los Solution Partners. ⚪ Si un Tech Provider puede pagar por su cliente [M2] |
| **El nombre visible** | ⚪ **El riesgo de este modelo.** El nombre «debe tener relación con el negocio». Si el titular es una agencia, la relación debe constar en las webs de los dos. Esto viene de fragmentos del buscador, no de la página leída [M15]. Además, el número tiene que «ser tuyo» [M16], y la política prohíbe engañar sobre la afiliación [M1] | La clínica es la titular: el nombre es el suyo, sin dudas |
| **Límites de mensajería** | Por portafolio desde el 08/10/2025: **compartidos por todas las clínicas**. 250 contactos al día al empezar, 2.000 con la verificación [M9] | Los de cada clínica |
| **Números** | 2 por portafolio al principio, hasta 20 al verificarse [M9] | Los de cada clínica |
| **Si la clínica se va** | La WABA no se le puede dar [M4]. Habría que mover el número, y ese camino está documentado para Solution Partners [M20] | Se va con lo suyo: se le retira el acceso |
| **Si una clínica abusa** | Las restricciones caen sobre el portafolio, o sea sobre **todas** [M10] | Solo sobre la suya |
| **Coexistencia** (D3) | No: exige Tech Provider [M8] | Posible |

**Lectura del agente, no decisión:** (a) es el único modelo disponible sin ser
Tech Provider y el único en el que CobaltIA paga Meta, que es lo que pide el
modelo de negocio. Pero su encaje con las normas del nombre visible **no está
confirmado**. Por eso el paso 3.2 es preguntárselo a Meta por escrito, a través
de Business Support, antes de crear nada. La pregunta, para copiarla:

> «Somos un proveedor de software (CobaltIA) que gestiona por Cloud API, desde
> nuestra propia WABA, el número de WhatsApp de una clínica dental cliente
> nuestra, con el nombre visible de la clínica. ¿Está permitido, y qué tiene
> que constar en las webs de las dos empresas? ¿O tenemos que ser Tech
> Provider y que la WABA sea de la clínica?»

### 5.3 · D3 · El número de la clínica (DECISIÓN ABIERTA)

**No se resuelve en este plan.** Se decide cuando exista la clínica real, con
estas tres opciones delante:

| | **Migrar su número a Cloud API** | **Coexistencia** (el mismo número en la app y en el bot) | **Un número nuevo de CobaltIA** |
|---|---|---|---|
| **Cómo** | La clínica borra su cuenta en la app WhatsApp Business. El número queda libre en unos 3 minutos [M7] | Alta por Embedded Signup. App WhatsApp Business 2.24.17 o posterior [M8] | Una línea nueva, registrada en Cloud API |
| **Exige** | Nada especial | **Tech Provider** (o Solution Partner) y Embedded Signup [M8], o sea el modelo (b) | Nada especial |
| **El historial de la app** | **Se pierde** [M7] | Se sincronizan 180 días, con 24 h para hacerlo [M8] | Se queda en la app, con el número viejo |
| **Volver atrás** | Solo quitando el número de Cloud API; el historial no vuelve [M7] | La clínica se desconecta desde Ajustes [M8] | No hay nada que deshacer |
| **Lo que sigue funcionando** | Nada en la app: el número solo lo atiende el bot | La app sigue. El bot ve lo que escribe la clínica (`smb_message_echoes`). Se desactivan las listas de difusión, los mensajes temporales y la ubicación en tiempo real. Los grupos no se sincronizan. Caudal fijo de 20 mensajes por segundo [M8] | Las dos cosas, separadas |
| **Para los pacientes** | Siguen escribiendo al de siempre | Siguen escribiendo al de siempre | Tienen que aprender un número nuevo. La clínica lo anuncia |
| **Para el código** | Nada | ⚠️ **El bot contestaría también cuando escribe recepción.** Hay que tratar `smb_message_echoes` y decidir qué pasa si una persona contesta a mano. **Es trabajo nuevo, no presupuestado.** Además se parece mucho a la «bandeja de respuesta humana», que está fuera de alcance | Nada |
| **Coste** | — | — | 💶 la línea |

### 5.4 · Los pasos

**3.1 · 👤 Mirar hoy WhatsApp Manager** (sin coste, solo lectura)

1. Entra en business.facebook.com → WhatsApp Manager → la cuenta de WhatsApp
   del número de prueba → **Configuración de pago**.
2. Apunta si hay método de pago.
3. Busca un aviso sobre el **cobro de los mensajes de servicio desde el
   01/10/2026**. Una página de Meta dice que desde ayer se cobran los mensajes
   de servicio y las utility dentro de la ventana; la página general de precios
   dice que son gratis [M6]. Lo que diga tu WhatsApp Manager manda.
4. En developers.facebook.com → WhatsApp → Pricing, descarga las tarifas en EUR
   (CSV o PDF) y busca la fila de **España**. El investigador no pudo leer las
   cifras oficiales, y las de blogs no coinciden entre sí. No se usan.

**3.2 · 👤 Preguntarle a Meta por el modelo (a)**, con el texto de §5.2.

**3.3 · 👤 D2, el modelo.** Con la respuesta de Meta y con D1 (§5.2).

**3.4 · 🔴 Publicar la app** (Meta)

- **Antes:** la app dice «En desarrollo»; el «Test» de `messages` responde
  (ESTADO_F9 §7.4).
- **Qué pide Meta:**
  - la URL de la política de privacidad (2.3);
  - un icono de 1024 × 1024;
  - la categoría y el uso empresarial;
  - una URL con instrucciones para borrar los datos.
  Esto viene de un resumen del buscador, sin leer la página [M5b]. Para una
  app que solo usa sus propias WABAs no hace falta App Review [M3]. ⚪ Si pasar
  a «Live» exige verificar el negocio.
- **Dónde publicar la política sin dominio:** puede ser una página del propio
  sitio, `https://bot-clinica-whatsapp.vercel.app/privacidad` (ESTADO_F9 §12,
  paso 5). Escribirla es 🤖 cuando el asesor dé el texto, y pasa por un PR.
- **Después:** escribes «Hola» desde tu móvil al número de prueba. Llegan la
  respuesta y su rastro en `eventos_webhook`, `mensajes` y `eventos`, como en
  ESTADO_F9 §11.10, pero **entregado por Meta**. **Con eso F9 queda cerrada.**
- **Deshacer:** volver a poner la app en modo desarrollo.

**3.5 · 👤🏛 Verificar el negocio.** Los datos tienen que coincidir con los de
la entidad legal [M19]. ⚪ Qué documentos acepta Meta en España y si vale una
persona física sin alta: no se ha podido leer. Va después de D1.

**3.6 · Solo con (b): hacerse Tech Provider.**
- Lo que exige: el negocio verificado (3.5), App Review con dos vídeos y
  acceso avanzado a `whatsapp_business_messaging` y
  `whatsapp_business_management` [M2][M3].
- Los vídeos y la documentación los prepara 🤖 y los envías tú.
- La coexistencia también pasa por aquí (§5.3).

**3.7 · 🔴 El token de usuario del sistema**

1. Ve a Configuración del negocio → Usuarios del sistema → **Añadir**, con rol
   **Admin**: tendrá acceso a todas las WABAs del portafolio [M13].
2. **Asignar activos:** la app, con «Gestionar app», y la WABA.
3. Pulsa **Generar token**, con tres permisos: `business_management`,
   `whatsapp_business_management` y `whatsapp_business_messaging`.
   ⚪ Que no caduque nunca: Meta lo llama «long-lived» y no lo confirma [M13].
4. **Tú** lo pegas en Vercel → proyecto → Settings → Environment Variables →
   `WHATSAPP_TOKEN` → Edit.
5. 🤖 vuelve a publicar.
6. Comprobación: la ruta ampliada de 7.1 dice que el número contesta.
   Sin 7.1, este cambio **no se puede comprobar** sin mandar un mensaje.

- **Deshacer:** volver a pegar el token anterior. Guárdalo hasta comprobar el
  nuevo.

**3.8 · 🔴 Registrar el número de la clínica** (con la clínica, D3 decidida)

- **D4, antes de registrar:** el almacenamiento en reposo en **Alemania**
  (`DE`). Solo se activa con el número sin registrar [M12]. Después obliga a
  darlo de baja y a registrarlo otra vez.
- El **nombre visible** se pide al registrar. ⚪ Cuánto tarda la aprobación.
- El **PIN de verificación en dos pasos** son 6 dígitos y se fija al registrar
  [M18]. Va a un gestor de contraseñas; no se apunta en este repositorio.
- Lo que Meta da: el `phone_number_id` y el id de la WABA, que van a la ficha
  (4.2).

**3.9 · 💶 El método de pago.** En el modelo (a), en la WABA de CobaltIA. En el
(b), en la de la clínica. La moneda de la WABA se fija al crearla y no se puede
cambiar después de adjuntar una línea de crédito [M4]: **EUR**.

**3.10 · Las tres plantillas** (`entregas/plantillas-meta.md`, sin cambios)

- Son por WABA: si cada clínica tuviera la suya, se crean en cada una [M10].
- Aprobación en hasta 24 h [M10].
- Meta puede recategorizar una utility como marketing con 1 día de aviso [M10].
- **`confirmacion_cita` no la manda ningún código de `src/`.** Solo existe en
  `plantillas.ts:102` y en las pruebas, y `procesar.ts` llama a
  `responderAlPaciente` sin respaldo. Aprobarla no hace daño, pero no es
  necesaria (D13).
- **`aviso_escalado`** va al teléfono de recepción. Ese teléfono:
  - **no puede ser el mismo número que atiende el bot**;
  - tiene que tener WhatsApp;
  - ⚪ si su titular necesita dar su permiso: no confirmado.
  Lo recoge la entrevista (§6.2).

**3.11 · El permiso de los pacientes para recibir recordatorios (D14)**

- **Lo que pide Meta:** el permiso para mensajes posteriores, diciendo
  claramente el nombre de la empresa, y una forma clara de darse de baja que
  hay que respetar «dentro o fuera de WhatsApp» [M1][M11]. ⚪ Si vale pedirlo
  dentro de la propia conversación: no aparece en la lista de métodos [M11].
- **Lo que hace hoy el código:**
  - Los recordatorios salen para **toda** cita `confirmada` que entra en la
    ventana (`recordatorios.ts:240-254`), sin mirar ningún permiso.
  - Esas citas solo las crea el bot: el panel actualiza y no crea
    (`acciones.ts:206` y `:262`). O sea, toda cita viene de un paciente que
    escribió por WhatsApp.
  - `pacientes.consentimiento_en` existe y **no lo escribe nadie**: solo lo
    enseña el panel (`fichas/[id]/page.tsx:81`).
  - Si alguien escribe «no quiero recordatorios», nada lo atiende.
- **Propuesta, para que la valoren el asesor y tú:**
  - El resumen de la cita (bloque 50) añade una frase: «Te mandaremos un
    recordatorio por aquí el día antes».
  - `crear_cita` anota `consentimiento_en` cuando el paciente dice que sí.
  - Los recordatorios salen solo con `consentimiento_en` puesto.
  - Darse de baja escala a recepción, que es lo que hace hoy el botón
    «Cancelar» (ESTADO_F6 §3.3).
  - **Toca el bloque 50, que está protegido:** va con tu confirmación aparte.

---

## 6 · Bloque 4 · Qué pedir a la clínica

### 6.1 · Contrato

**ENTREGA.**
- La ficha (`fichas/<slug>.json`), con 0 errores.
- Lo que el guion no recoge (§6.2), anotado fuera de la ficha.
- La hoja para la clínica.

**PRUEBA.**
- `leerFicha` devuelve 0 errores.
- Cada fila de §6.2 tiene su respuesta.
- La aprobación escrita de las FAQ existe.

**LÍMITES.**
- No se reescribe `.claude/commands/alta-clinica.md`: este bloque dice lo que le
  falta.
- Nada de datos de salud.
- Los motivos de visita, cerrados (ampliarlos es una migración).

**SUPUESTOS.** La clínica tiene una política de privacidad publicada. Si no la
tiene, el alta se para: es obligatoria en la ficha.

**FALLOS.**
- Una FAQ que la clínica «aprobó» de palabra y que el bot dice **literalmente**.
- Un teléfono de avisos que es el mismo número del bot.

### 6.2 · Lo que el guion actual no recoge

El guion (`.claude/commands/alta-clinica.md`) ya saca:
- los datos de la clínica, los horarios, los gabinetes y los tratamientos con
  su frase;
- el trato y el nombre del asistente;
- las FAQ y lo que no puede decir;
- el identificador del número, la política de privacidad, el mensaje de
  urgencia y los usuarios.

Falta esto:

| Qué | Para qué | Dónde va |
|---|---|---|
| Razón social, CIF, domicilio social, firmante y su cargo | Los contratos (2.4 y 2.5) | Fuera de la ficha: en el contrato |
| ¿Tienen delegado de protección de datos? Nombre y contacto | El contrato de encargo | En el contrato |
| Su número de WhatsApp: cuál es, si lo usan hoy en la app WhatsApp Business, quién lo lleva y si quieren seguir usándolo en la app | **D3** | Notas de la fase |
| Si tienen ya un portafolio de Meta y web propia, y la URL | **D2**: el nombre visible se relaciona con su web [M15] | Notas de la fase |
| Quién recibe los avisos: un **WhatsApp distinto** del número del bot, y un correo | `aviso_escalado` y Resend | `telefono_recepcion` y `email_avisos` de la ficha |
| A qué horas atiende recepción los escalados | El texto del mensaje de urgencia | `config.mensaje_urgencia` |
| Los usuarios del panel: persona, correo y papel (propietario, recepción o lectura) | El alta | `usuarios` de la ficha |
| **La aprobación por escrito** de cada respuesta de FAQ, del mensaje de urgencia, de la frase de cada tratamiento y de qué es público | El bot lo dice **palabra por palabra** | Un documento firmado o un correo de la clínica, guardado con el contrato |
| Volumen esperado de mensajes al mes | Para fijar el cupo incluido (bloque 8) | El contrato de servicio |
| Si quieren que el bot avise de los recordatorios, y con qué palabras | D14 | Notas de la fase |

### 6.3 · La hoja para la clínica

En `entregas/hoja-para-la-clinica.md`. Es corta y está escrita en su idioma:
publicar, conectar, valores secretos. Nunca «deployment», «environment
variables» ni «repository».

⚠️ **Su punto 4 («cada persona del panel recibirá un enlace para poner su
contraseña») describe un paso que hoy no funciona** (pendiente 34, §7.2 paso
5.6). Se puede mandar la hoja, porque lo que promete es lo que habrá. Pero el
alta no se hace hasta que el 34 esté publicado, y el punto se repasa entonces
por si el enlace cambia de forma.

---

## 7 · Bloque 5 · El alta técnica

### 7.1 · Contrato

**ENTREGA.** La clínica en producción. Su par en `WHATSAPP_CLINICAS` y el sitio
vuelto a publicar. La ruta de salud en `al_dia` con las dos clínicas. Un primer
mensaje real contestado.

**PRUEBA.**
- Lecturas de solo lectura antes del alta.
- La salida del alta.
- El recuento con `postgres`, que es otra credencial.
- `al_dia`.
- El rastro del primer mensaje en la base.
- Si lo decides, el acta (5.9) y el centinela (5.10).

**LÍMITES.**
- Las tres variables de producción **solo al proceso del alta**, leídas de
  variables de usuario de Windows y borradas al terminar.
- Un cerrojo por la referencia del proyecto que lleva cada JWT (memoria
  `alta-contra-produccion`).
- Los enlaces con token, tapados en la salida.

**SUPUESTOS.**
- `process.loadEnvFile('.env.local')` no pisa lo que ya está en el entorno
  (medido el 02/10, memoria).
- La ficha queda fuera del repositorio: `.gitignore:55-56` ignora
  `fichas/*.json` menos el ejemplo.

**FALLOS.**
- Si falta una variable, `.env.local` la rellena **con la de desarrollo**, y el
  alta queda a medias entre dos bases sin un solo error. Lo para el cerrojo.
- Un mapa escrito a mano con una errata (§11.4).

### 7.2 · Los pasos

**5.1 · 🤖 La ficha.** La valida el propio proyecto, sin tocar nada:

    node -e "import('./scripts/ficha.mjs').then(async m => console.log((await m.leerFicha('fichas/<slug>.json')).errores))"

Y la comprobación de que git no la ve:

    git check-ignore -v fichas/<slug>.json

**5.2 · 👤 Poner las claves de producción en Windows.** Como el 02/10 (ESTADO_F9
§11.8), nunca por terminal ni por el chat.

1. Pulsa **Windows + R**, escribe esto y pulsa Intro:

       rundll32 sysdm.cpl,EditEnvironmentVariables

2. En **«Variables de usuario»**, pulsa **«Nueva…»**.
3. Nombre: `SUPABASE_SERVICE_ROLE_KEY_PROD`.
   Valor: en supabase.com → proyecto de **producción**
   (`hzanffqxlpcorrucanxd`) → Project Settings → API Keys → claves heredadas
   (legacy) → `service_role` → Reveal → Copy. Pulsa **Aceptar**.
4. Igual con `NEXT_PUBLIC_SUPABASE_ANON_KEY_PROD`, la `anon` de esa misma
   pantalla.
5. **Solo si decides el acta (5.9):** `SUPABASE_JWT_SECRET_PROD`, desde Project
   Settings → JWT Keys → Legacy JWT secret → Reveal.
6. **Aceptar** y **Aceptar**. Y dime «puestas».

**5.3 · 🤖 El cerrojo, de solo lectura.** Es lo mismo que el 02/10:
- La `service_role` y la `anon` llevan `ref = hzanffqxlpcorrucanxd` y su rol.
- `/auth/v1/settings` con la `anon`: 200. Con una clave falsa de control: 401.
- `GET clinicas` con la `service_role`: el slug y el número están libres.
- El lanzador, con una `service_role` falsa: **«NO SE LANZA»**.

El lanzador de F9 vivió en el scratchpad. **Propuesta:** llevarlo a
`scripts/` para que no se reescriba en cada alta. Es un PR aparte.

**5.4 · 🔴 El alta.**

- **Antes:** el inventario con `postgres` (`SUPABASE_DB_URL_PROD`) da 1
  clínica, `prueba-f9`.
- **El comando:** `pnpm alta fichas/<slug>.json`, con las tres variables solo
  en ese proceso.
- **Después:** la salida del alta, con los enlaces tapados.
- **Deshacer:** borrar la clínica nueva en cascada y sus usuarios, con el
  procedimiento de §8.4. Mientras su número no esté en el mapa, nadie le ha
  escrito.

**5.5 · 🤖 Contar con otra credencial.** Con `postgres` por
`SUPABASE_DB_URL_PROD`, solo lectura, igual que ESTADO_F9 §11.8:
- filas por tabla de la clínica nueva **frente a la ficha**;
- `auth.users`, con el rol en `app_metadata` y nada en `user_metadata`.

**5.6 · 👤 Los enlaces para poner la contraseña.** ⛔ **Hoy no funciona
(pendiente 34).**

**Por qué** (comprobado el 05/10 leyendo el código, y visto el 02/10 en
producción por el asistente de F9 con el usuario de la clínica de prueba):
- El alta se queda con el `action_link` de `generateLink({ type: 'recovery' })`
  (`alta-clinica.mjs:483-494`).
- Ese enlace pasa por `/auth/v1/verify` y vuelve al sitio con la sesión en el
  fragmento de la URL.
- En `src/` no hay nada que la lea: ni `verifyOtp`, ni
  `exchangeCodeForSession`, ni `updateUser`. `crearClienteNavegador()` no lo
  importa nadie, y las únicas rutas son `api`, `entrar` y `panel`.
- El guardián manda a `/panel` y de ahí a `/entrar`, y nadie llega a poner
  contraseña.

**Lo construye el asistente de F9**, en una rama propia salida de `main` cuando
se fusione el PR #4:
- Una ruta pública que recibe `token_hash` y `type=recovery`, hace
  `verifyOtp` en el servidor con el cliente de servidor (sin tocar la
  separación de los tres clientes) y enseña un formulario de contraseña nueva
  (`updateUser`).
- El alta construye el enlace con `properties.hashed_token` hacia el dominio de
  producción, en vez de usar el `action_link`.
- La Site URL y las Redirect URLs del Auth de producción, revisadas.
- Pruebas:
  - enlace válido, caducado y ya usado;
  - que no sirva para otra cuenta;
  - que el guardián deje pasar esa ruta sin sesión, y nada más del panel.
- Revisión de seguridad, porque toca la autenticación.

**Cuando esté publicado**, este paso se reescribe con el enlace nuevo, y lo que
siga valiendo de antes: uno a uno, por un canal privado, caduca y vale una
vez. Y se comprueba **con un usuario de verdad** antes de dárselo a la
clínica: el control (`cobaltiautomations@gmail.com`) sirve para eso.

**5.7 · 🔴 El par en `WHATSAPP_CLINICAS`, y volver a publicar.**

- **El valor no se teclea:** 🤖 lo saca de la base con una lectura (`select
  wa_phone_number_id, id from clinicas where activa`). Así el mapa es lo que
  hay en la base, y el par de la clínica de prueba sigue dentro (D6).
- Antes de mandarlo se valida: JSON válido, cada valor un uuid, sin números
  repetidos.
- **Antes:** la lista de variables (nombre, entorno y tipo, sin valores) y la
  ruta de salud diciendo `al_dia` con 1 clínica.
- **Qué se hace:** `PATCH` de la variable y `POST /v13/deployments` (memoria
  `vercel-proyecto-y-token`).
- **Después:** el despliegue READY en `fra1`, las cuatro crons en él y, en 5.8,
  `al_dia` con **2 clínicas**.
- **Deshacer:** el `PATCH` con el valor anterior, que también se saca de la
  base, y volver a publicar.

**5.8 · 🤖 La ruta de salud.** `crons/run` de `/api/cron/clinicas` → `al_dia` ·
`hzanffqxlpcorrucanxd` · 2 clínicas.

La línea por clínica puede no llegar a la escucha (pendiente 21). Manda la
cabecera, que solo dice `al_dia` si **todas** atienden (`clinicas.ts:115`).

**5.9 · 🔴 El acta (`pnpm alta:comprobar <slug>`). DECISIÓN TUYA (D5).**

La regla vigente es no lanzar pruebas contra producción. El acta es una
prueba, así que va solo si tú lo decides. Lo que hace de verdad, leído en su
código:

- **Lo que lee:**
  - mira lo que el bot ve **contra la ficha**, fila por fila;
  - mira la política de privacidad en el prompt montado y el mensaje de
    urgencia en `mensajeSeguro()`;
  - pasa las 30 preguntas adversarias con un modelo de mentira. **No llama a
    Gemini.**
- **Lo que escribe en la clínica real y luego borra:**
  - **tres** filas canario, en `config`, `tratamientos` y `faq`, no solo un
    tratamiento;
  - una conversación con el teléfono `+34999000001`;
  - los escalados que provoquen las preguntas
    (`02-acta.comprobacion.ts:219-316`).
- **Lo que deja para siempre:** unos 30 apuntes `contador_prompt` en `eventos`,
  que la clínica verá en Observabilidad.
  ⚠️ El comentario del acta dice que «la purga de 90 días se lo lleva»
  (`02-acta.comprobacion.ts:21-24`) **y es falso**: `purgar_historial` borra
  `conversaciones`, `mensajes` y `eventos_webhook`, no `eventos`
  (`20260916100700_integridad.sql:305-365`). Pendiente nuevo, el 27.
- **Lo que necesita en el proceso:**
  - la URL, la `anon`, la `service_role` y **el secreto JWT** de producción,
    porque el cliente del bot firma con él;
  - **y `WHATSAPP_CLINICAS`**, porque comprueba el mapa de esta máquina.
  No hay cerrojo que lo impida: `exigirQueNoSeaProduccion` solo lo llaman la
  siembra y la limpieza (`siembra.ts:148` y `:168`).
- **La recomendación del agente:** lanzarla **antes de anunciar el número**,
  sin conversaciones reales con las que mezclarse. Es lo único que compara lo
  que dijo la clínica con lo que ve el bot y que pasa la barandilla 4 con sus
  datos. Su coste es el secreto JWT de producción en esta máquina un rato.
- **Si no se lanza:** el alta queda en «creada», no en «dada de alta»
  (`entregas/alta-de-una-clinica.md`), y eso se dice así en el registro de la
  fase.

**5.10 · 🔴 El centinela de plantillas** (`--plantilla <móvil>`).

- Manda un `recordatorio_cita` **de verdad** desde el número de la clínica.
- 💶 Una plantilla utility.
- Necesita además `WHATSAPP_TOKEN` en el proceso, que en Vercel es sensitive:
  sería otra variable de Windows (`enviar.ts:109`).
- Lo que hay que mirar en el móvil, y por qué los botones no se pulsan: en
  `entregas/plantillas-meta.md`.

**5.11 · 👤🤖 El primer mensaje de verdad.**
1. Tú escribes «Hola» desde tu móvil al número de la clínica.
2. Llega la respuesta, y el primer mensaje se identifica como asistente
   virtual.
3. 🤖 lee el rastro en la base, como en ESTADO_F9 §11.10.

**5.12 · 👤 Borrar las variables de Windows.** En la misma ventana del 5.2:
selecciona cada una → **Eliminar** → Aceptar. 🤖 comprueba «NO ESTÁ», con
`SUPABASE_DB_URL_PROD` como control que sí está.

---

## 8 · Bloque 6 · El modo de prueba

### 8.1 · Contrato

**ENTREGA.** D6 tomada. Si se conserva, la clínica de prueba queda documentada
como control y sin tus datos personales. Si se borra, no queda ni una fila.

**PRUEBA.** Cada recuento a cero, con una segunda credencial y con un control
que sí encuentre filas.

**LÍMITES.** Nada se toca hasta que la clínica real diga `al_dia` **y** haya
contestado un mensaje real (5.11).

**SUPUESTOS.**
- `prueba-f9` (`b53d5bf6-61aa-43c0-a1c0-54b4a46d47be`) no tiene citas.
- Su número es el de prueba de Meta.

**FALLOS.**
- Quitar la de prueba antes de que la real funcione, y quedarse sin la única
  clínica que demuestra que el sitio atiende.
- Un cero que no prueba nada.

### 8.2 · La recomendación: conservarla como control permanente

**Por qué.** Es la forma que tiene este proyecto de no fiarse de un verde
(`.claude/CLAUDE.md`, «Un verde no es una garantía»):

- **Comprobar sin tocar a quien paga.** Después de cada publicación se puede
  repetir lo de ESTADO_F9 §11.10 contra el control:
  - la ruta de salud;
  - un aviso firmado que recorre el bot entero.
  Sin escribir en la base de una clínica que paga y sin mandar nada a un
  paciente.
- **Un cero con control.** «La clínica X no tiene filas» solo vale al lado de
  una que sí las tiene, y el control siempre las tiene.
- **Un canario de producción.** Sus filas confidenciales llevan el marcador
  `F9-CONFIDENCIAL-7Q2X`. Cualquier comprobación de la barandilla 4 en
  producción puede buscarlo sin sembrar nada.
- **Las urgencias y el resto del camino, probados en producción** sin una
  persona real del otro lado.

**Lo que cuesta, y cómo se cubre:**

| Coste | Cómo se cubre |
|---|---|
| Tu teléfono y tus dos mensajes están en producción | 6.2: se borra tu conversación. Si no, la purga se la lleva hacia el 31/12/2026 |
| Un usuario `propietario` más en producción (`cobaltiautomations@gmail.com`) | Se queda, con verificación en dos pasos. Sirve para mirar el panel publicado y para probar la página del pendiente 34 antes de dársela a la clínica. ⚪ Hoy no tiene contraseña: la pones tú con una orden de un solo uso, fuera del repositorio y sin pasar por ningún asistente (aviso del 05/10) |
| Se cuela en los recuentos de consumo | El cierre mensual la excluye por su `id` (bloque 8) |
| Sus bloques de prompt se quedan viejos cuando cambien los de las clínicas | Se vuelven a sembrar con `pnpm bloques` cuando cambien |
| Si el control se rompe, `al_dia` se pone rojo para todo el sitio | Es lo que se quiere: una ruta de salud que no mira el control no lo mira |
| Ocupa uno de los 2 números del portafolio | ⚪ Si el número de prueba cuenta para el límite [M9]. Si cuenta y falta sitio para la clínica, se borra |

Y una cosa que **no** se puede hacer: «desactivarla» con `activa = false` y
dejarla en el mapa. `exigirClinicaDelCanal` la rechaza (`almacen.ts:96-98`) y la
ruta de salud se pone roja.

### 8.3 · Los pasos, si se conserva

**6.1 · Esperar.** La real tiene que estar en `al_dia` y haber contestado
(5.8 y 5.11).

**6.2 · 🔴 Borrar tu conversación.** Es tu teléfono, y su finalidad (probar F9)
ya está cumplida.

- **Antes**, con `postgres` y en una sola consulta:
  - las conversaciones y los mensajes de `prueba-f9` con tu número (espera 1 y
    2, o más si has probado después);
  - **y**, como control, las conversaciones de la clínica real, que tienen que
    ser más de 0 tras 5.11.
- **Qué se hace:** un `delete` de esa conversación, con sus mensajes en
  cascada, dentro de una transacción que se confirma solo si el recuento
  coincide.
- **Después:**
  - la misma consulta: 0 para tu conversación y lo mismo de antes para el
    control;
  - **segunda credencial:** entras en el panel con `cobaltiautomations@gmail.com`
    → Conversaciones: vacío. Y en la misma sesión, Conocimiento enseña sus 4
    FAQ, para demostrar que la sesión ve la clínica. Necesita que ese usuario
    ya tenga contraseña (§8.2). Si no la tiene, la segunda credencial es el
    Table Editor del panel de Supabase.
- **Deshacer:** no tiene. Son datos de prueba tuyos.

**6.3 · Renombrarla** para que nadie la confunda (opcional, 🔴): `nombre =
'Control CobaltIA (no es una clínica)'`. El bot dice ese nombre en su saludo.

**6.4 · 👤 Meta:** en el número de prueba (WhatsApp → Configuración de la API →
«Para»), deja solo tu móvil.

### 8.4 · Los pasos, si decides borrarla

Por este orden, y cada uno 🔴 con su «sí»:

1. **El mapa sin el par de prueba**, sacado de la base como en 5.7. Volver a
   publicar. `al_dia` con **1 clínica**, la real.
   - **Deshacer:** volver a poner el par.
2. **El borrado en la base**, por el mismo camino que la limpieza de las
   pruebas, que lo hace en cada CI (`siembra.ts:144-162`): borrar la clínica
   arrastra en cascada todo lo suyo.
   - **Antes:** con `postgres`, filas por tabla con `clinica_id = b53d…`.
     Esperado: `clinicas` 1, `gabinetes` 1, `horarios` 5, `tratamientos` 2,
     `faq` 4, `config` 4, `bloques_prompt` 10, `conversaciones` ≥ 1,
     `mensajes` ≥ 2, `eventos` ≥ 1, `eventos_webhook` ≥ 1. **Y la misma
     consulta para la clínica real**, como control.
   - **Ensayo:** el `delete` dentro de una transacción que acaba en
     `rollback`, para ver que la cascada pasa sin errores.
   - **De verdad:** `delete from public.clinicas where id = 'b53d…' and slug =
     'prueba-f9'` → 1 fila.
3. **El usuario del panel.** 👤 supabase.com → producción → Authentication →
   Users → `cobaltiautomations@gmail.com` → Delete user.
   **Antes de borrarlo:** que no lo uses también como usuario de la clínica
   real.
4. **Después:**
   - la consulta del paso 2: todo 0 para `b53d…`, y lo de antes para la real;
   - **segunda credencial:** en el panel de Supabase (Table Editor →
     `clinicas`) se ve la real y no la de prueba; en Authentication → Users no
     está el usuario;
   - y `al_dia` con 1 clínica.
5. **Meta:** el número de prueba lo da Meta y no se borra. Se vacía la lista
   «Para».
   - **Deshacer el conjunto:** el alta de prueba otra vez, con la ficha de
     F9. Está en el scratchpad de aquella sesión: ⚪ comprobar que sigue ahí
     antes de borrar.

---

## 9 · Bloque 7 · Antes del primer paciente

### 9.1 · Contrato

**ENTREGA.**
- Copias de seguridad.
- Gasto vigilado.
- Correo de escalados.
- Los pendientes que afectan a una clínica real, cerrados o con fecha.
- Una lista final que diga «sí» punto por punto.

**PRUEBA.** Cada punto con su comprobación (abajo). Los cambios de código, con
su prueba vista en rojo.

**LÍMITES.**
- `bot.ts` (7.10, pendiente 13) y el bloque 50 (3.11) esperan tu confirmación.
- Nada de pausar producción por gasto (7.7).

**SUPUESTOS.** Los de §1.

**FALLOS.** Un aviso de gasto que no llega a nadie. Una copia que existe y nunca
se ha restaurado.

### 9.2 · Lo encontrado leyendo el código, que una clínica real notaría

1. **Si Gemini falla, el paciente no recibe nada.**
   - Qué pasa: `responder()` lanza (`procesar.ts:309`), nadie lo recoge en
     `procesarMensaje`, y `after()` solo lo escribe en el registro
     (`route.ts:181-188`).
   - Por qué importa: con una sola clave y prepago, un saldo a 0 (402) o un
     429 callan a **todas** las clínicas a la vez.
   - Lo que sí se salva: **las urgencias**. Las reglas duras cortan antes de
     llamar a ningún modelo (`clasificador.ts:198-220`, `cerebro.ts:169-201`).
   - → **7.3**: un mensaje de respaldo con el teléfono de recepción y un
     escalado.
2. **La ruta de salud clasifica el 402 como temporal.** `PERMANENTE` solo
   tiene 400, 401, 403 y 404 (`salud/route.ts:64-69`). Un saldo agotado sale
   como `inestable` (503, «vuelve luego»), y no se arregla esperando.
   → **7.1**.
3. **Ni el token de Meta ni la clave de Deepgram los comprueba nadie** en
   producción (§3.5). → **7.1**: una lectura del número por la API de Meta
   (nombre visible y calidad) y una de Deepgram (`/v1/projects`), las dos sin
   coste.
4. **Deepgram conserva el audio por defecto** (§4.2). → **7.2**:
   - `mip_opt_out=true` siempre;
   - `api.eu.deepgram.com` si se decide D8;
   - ⚪ si `mip_opt_out` cambia el precio: mirarlo antes.
5. **El historial del grupo puede repetir mensajes** (`procesar.ts:298`): resta
   ids de una identidad global. → **7.4**.
6. **`coste_eur` vale 0 en producción** (bloque 8). → **8.3**.

### 9.3 · Los pasos

**7.1 · 🤖 Ampliar la ruta de salud** (PR, sin coste).
- Meta por número, Deepgram y el 402 como permanente.
- Pruebas de nivel 1 vistas en rojo con cada credencial mala.
- Va antes de cualquier cambio de cuenta (bloque 1).

**7.2, 7.3 y 7.4 · 🤖 Los arreglos de §9.2**, cada uno en su PR, con su prueba en
rojo.

**7.6 · 👤 💶 Supabase de producción a Pro.**
1. supabase.com → la organización de producción → Billing → Change plan →
   **Pro**.
2. Lo que da [S1]:
   - copias diarias, 7 días;
   - no se pausa;
   - el límite de gasto viene activado.
   PITR es aparte (unos 100 USD/mes los 7 días) y no hace falta para empezar.
3. Comprobación: Billing dice Pro, en Database → Backups aparece la primera
   copia al día siguiente, y `al_dia`.
4. **Una vez antes del primer paciente:** restaurar una copia en un proyecto
   aparte o leer el procedimiento. Una copia que nunca se ha restaurado no
   está probada.
5. ⚪ **Hoy, en Free, producción se puede pausar** tras unos 7 días de poca
   actividad [S1]. Si un día la ruta de salud dice `token_rechazado` o falla
   la conexión, mira primero si el proyecto está en pausa.

**7.7 · 👤 El gasto.**
- **Google:**
  - Los presupuestos **solo avisan** [G4].
  - El tope de AI Studio (aistudio.google.com/spend) es «experimental»
    y puede pasarse unos 10 minutos [G2].
  - Con prepago, mantén un saldo con margen y mira si existe la recarga
    automática (⚪). El saldo a 0 corta todo [G2], y los créditos caducan a
    los 12 meses.
- **Vercel:**
  - Spend Management viene activado en Pro, con avisos al 50, 75 y 100 %
    [V2].
  - **No actives «Pause Production Deployments»:** pausa **todos** los
    proyectos del equipo con un 503 [V2], es decir, el bot de todas las
    clínicas.
- **Deepgram:** ⚪ los avisos de saldo bajo no están documentados. Mira el
  saldo a mano cada mes.
- **Meta:** el método de pago (3.9).

**7.8 · 👤 Restringir la clave de Gemini.**
1. aistudio.google.com → API keys → la clave del bot → **«Restrict to Gemini
   API only»**.
2. Por qué: según Google, la API «rechaza las claves estándar sin
   restricciones», y desde el 28/05/2026 las claves nuevas de AI Studio son de
   otro tipo [G3]. Como el bot contestó el 02/10, la clave de hoy o ya está
   restringida o es de las nuevas: ⚪ mira cuál es. La restricción por IP no
   sirve: las IP de Vercel cambian, y las fijas cuestan 100 USD/mes [G3].
3. Comprobación: `/api/cron/salud` → 200.

**7.9 · 👤 💶 El correo de los escalados (decisión b de F9, que va con tener
empresa).**
1. Compra el dominio (7.9a).
2. Crea la cuenta de Resend.
3. Domains → Add Domain, con un subdominio (por ejemplo `avisos.<dominio>`) y
   región `eu-west-1`.
4. Pon los registros SPF, DKIM y MX en tu proveedor de dominio. Tarda de 15
   minutos a 72 horas [R2].
5. Pega `RESEND_API_KEY` y `EMAIL_REMITENTE` en Vercel.
6. 🤖 publica 🔴.
7. **Comprobación:** un escalado en el control (un aviso firmado que diga
   «quiero hablar con una persona»). Llega el correo y llega la plantilla.

⚠️ **Resend guarda siempre en EE. UU.** [R1]. Por eso el correo lleva el
teléfono y el motivo, nunca lo que escribió el paciente (`escalado.ts`). Que
siga así.

**7.10 · 🤖 Los pendientes vivos que afectan a una clínica real**

| # | Qué | Por qué antes del primer paciente | Cómo |
|---|---|---|---|
| 19 | El guardián tira el error de `getUser()` | Un fallo pasajero de Auth saca a recepción a la Agenda | El arreglo propuesto en ESTADO_F9 §11.5: registrar y reintentar una vez, y respetar `desde`. PR |
| 21 | La escucha de Vercel pierde líneas | Con una clínica real, diagnosticar por el registro falla justo cuando hace falta | Una línea por resultado en las rutas. Para el bot, manda la base. PR |
| 22 | Dos CI a la vez contra desarrollo | Cada arreglo de este bloque es un PR | 🟡 **Hecho por el asistente de F9** (`0f468a9`, PR #4): grupo `base-de-desarrollo` con `queue: max`, y GitHub lo acepta. Falta ver dos tiradas esperándose: el primer PR de F10 que coincida con otro lo dirá |
| 13 | Las claves heredadas de Supabase se retiran «a finales de 2026» | Si se retiran, el bot se calla en todas las clínicas | Pasar a las claves nuevas: conviven y se pasa sin corte [S4]. Luego, la firma asimétrica. Toca **`bot.ts`: confirmación aparte**. Fecha límite propia: **01/12/2026** |

**7.11 · ✅ El registro de Auth, apagado y leído.** Lo hizo el asistente de F9
el 02/10 (`6956181`). En producción, `disable_signup` pasó de `false` a `true`,
leído con la `anon` y con una clave falsa como control. Se sigue entrando con
correo y contraseña.

**7.12 · La lista final antes del primer paciente.** Todo «sí», o no se anuncia
el número:

- [ ] La página para poner la contraseña, publicada y probada con un usuario
      de verdad, y cada persona de la clínica dentro de su panel (34, 5.6)
- [ ] Contratos de servicio y de encargo firmados (4.4)
- [ ] Supabase Pro, con copias (7.6)
- [ ] Saldo de Gemini con margen y avisos de gasto (7.7)
- [ ] `al_dia` con todas las clínicas, la ruta de salud ampliada en verde (7.1)
      y `/api/cron/salud` en 200
- [ ] Respaldo si Gemini falla (7.3) y Deepgram sin conservar audio (7.2)
- [ ] Las plantillas aprobadas, y el centinela leído o decidido no hacerlo
      (5.10)
- [ ] El permiso de los pacientes resuelto (3.11)
- [ ] Correo de escalados (7.9), **o** decidido por escrito que se empieza
      solo con la plantilla
- [ ] Precios puestos y conteo mensual en marcha (bloque 8)
- [ ] El primer mensaje real contestado (5.11)

---

## 10 · Bloque 8 · Costes

### 10.1 · Contrato

**ENTREGA.**
- Lo que cuesta cada clínica, medido donde se pueda y dicho donde no.
- El conteo mensual por clínica, guardado más allá de los 90 días.
- El hueco preparado para cobrar el extra **sin fijar la cifra**.

**PRUEBA.**
- Una prueba que cruza el cambio de precio del 31/12 al 1/1.
- Una de RLS de la tabla nueva: cada clínica ve solo lo suyo y el bot no ve
  nada.
- El cierre de un mes en desarrollo, contado a mano y por la función.

**LÍMITES.**
- Ninguna cifra inventada: ni el extra, ni el cupo, ni las tarifas de Meta.
- `precio_extra` vale **null** hasta que lo decidas, y null no es 0.

**SUPUESTOS.**
- Los precios de Gemini de ESTADO_F9 §5c, de la página de precios del
  24/09/2026, vista otra vez el 01/10 [G8].

**FALLOS.**
- Un `coste_eur = 0` que parece «gratis» y es «sin medir» (pasa **hoy**).
- Un conteo que se calcula sobre `mensajes` después de la purga y sale bajo.

### 10.2 · Lo que se mide hoy, y dónde

| Coste | Qué se guarda por clínica | Dónde | ¿Sobrevive a los 90 días? | Lo que falta |
|---|---|---|---|---|
| **Gemini** | Los tokens de entrada y salida de cada respuesta, **sumando clasificador y cerebro** (`procesar.ts:302-307`). Y `coste_eur` | `mensajes.tokens_in`, `tokens_out` y `coste_eur` | No (purga) | ⚠️ **`coste_eur` es 0 en producción:** `GEMINI_EUR_POR_MTOKEN_*` no está entre las 12 variables de Vercel (ESTADO_F9 §11.4), y `costeEur` pone 0 sin ellas (`almacen.ts:303-312`). Con facturación activa ese 0 **miente**. Además, una sola tarifa para dos modelos que cuestan distinto: 0,75 y 3,75 USD por millón frente a 0,25 y 1,50 [G8] |
| **Meta: recordatorios** | Una fila por recordatorio, con su id único | `recordatorios`, y una fila de `mensajes` | Sí (`recordatorios`) | — |
| **Meta: avisos de escalado** | Una fila por escalado | `escalados` | Sí | Si el aviso salió de verdad no se guarda en la base, solo en el registro |
| **Meta: respuestas del bot** | Una fila con `wa_message_id` | `mensajes` | No | ⚠️ **Si se cobran desde el 01/10/2026** (3.1), cada respuesta cuesta. La tarifa depende del país del paciente: sale de `telefono_e164` |
| **Deepgram** | Una nota `sistema` por cada audio transcrito | `mensajes` | No | **No se guardan los segundos de audio.** El precio es por minuto: 0,0043 USD en nova-3 monolingüe [D3] |
| **Gemini, la salud del modelo** | 2 llamadas al día, sin clínica | — | — | Es un gasto general |
| **Vercel, Supabase, dominio y Resend** | Fijos | — | — | Es un reparto: decisión de negocio |

### 10.3 · El conteo mensual (migración 011, en desarrollo, con tu confirmación)

**8.1 · D7 · Qué es «un mensaje» para el cupo.** Es una decisión tuya, que va
al contrato.

| Opción | A favor | En contra |
|---|---|---|
| (i) Los mensajes del paciente | Es lo que la clínica entiende por «mensajes» | Cuatro mensajes seguidos dan **una** respuesta (debounce de 8 s), y se cobrarían cuatro |
| (ii) Las respuestas que manda el bot | Una por cada llamada al modelo: es lo que cuesta. Sin ambigüedad: una fila con `wa_message_id` | La clínica no lo ve desde el lado del paciente |
| (iii) Todo lo que sale: respuestas y plantillas | Lo que paga CobaltIA a Meta | Mezcla cosas que la clínica no pidió, como sus propios avisos |

**8.2 · La propuesta (migración 011, en desarrollo y con tu confirmación), que
no fija ninguna cifra:**

- **`consumo_mensual`**, una fila por clínica y mes, con `unique (clinica_id,
  mes)`. Columnas:
  - respuestas del bot, mensajes del paciente, recordatorios, avisos de
    escalado y notas de voz;
  - segundos de audio;
  - tokens por modelo;
  - coste estimado en euros;
  - `calculado_en`.
  La escribe un trabajo de `pg_cron`, como `postgres`, el **día 1 de cada
  mes** con el mes anterior. Así se adelanta a la purga de 90 días con margen
  y no depende de que nadie se acuerde. Lleva RLS en la misma migración: cada
  clínica ve lo suyo y el bot nada.
- **`condiciones_clinica`**: `clinica_id`, `desde`, `mensajes_incluidos` y
  `precio_extra_cent`, que **admite null** y queda en null hasta que lo
  decidas.
- **El informe** dice «exceso: N mensajes · precio: **sin fijar**» y no «0 €»,
  por la misma regla que el contador y que `coste_eur`: un null no es un 0.
- **El control** (`prueba-f9`), excluido del informe por su id.

**8.3 · Coste por modelo y precios con fecha** (🤖 PR):
- `Consumo` separa cerebro y clasificador.
- Las tarifas viven en código **con su fecha de validez**: hasta el 31/12/2026
  y desde el 1/1/2027, el doble [G8]. Antes de escribirlas se lee otra vez la
  página de precios.
- El cambio del 1/1/2027 no exige tocar nada ese día, y `coste_eur` queda bien
  en cada fila porque se calcula al guardarla.
- El cambio de USD a EUR, en una variable documentada como estimación.

**8.4 · 🔴 Los precios en producción.** Con 8.3 fusionado, el dato de la
conversión. Si 8.3 no llega a tiempo, `GEMINI_EUR_POR_MTOKEN_*` en Vercel y
volver a publicar.
- **Antes:** el último mensaje del bot del control tiene `coste_eur = 0`.
- **Después:** un aviso firmado al control, y su fila con `coste_eur > 0`.

**8.5 · Cada mes.** 🤖 lee `consumo_mensual` del mes anterior y lo compara con un
recuento a mano sobre `mensajes`, que todavía no se han purgado. Los dos tienen
que coincidir.

---

## 11 · Riesgos de una sola cuenta para todas las clínicas

### 11.1 · Una clave filtrada

Afecta a todas. Por orden de gravedad:

| Clave | Qué permite a quien la tenga | Cómo se cambia, sin corte | Mitigación de hoy |
|---|---|---|---|
| `SUPABASE_JWT_SECRET` | **Firmar como el bot de cualquier clínica** y leer lo público de todas | Hoy es el secreto heredado. Cambiarlo invalida la `anon`. Lo bueno es la firma asimétrica (7.10, pendiente 13) | Sensitive en Vercel, fuera del repositorio |
| `WHATSAPP_TOKEN` | Mandar mensajes desde los números de todas las clínicas | Token nuevo del usuario del sistema → Vercel → publicar → revocar el viejo (3.7) | Sensitive |
| `META_APP_SECRET` | Firmar avisos falsos al webhook | Regenerar en Meta → Vercel → publicar. Se comprueba con el «Test» de `messages` (ESTADO_F9 §7.4) | Sensitive |
| `GOOGLE_AI_API_KEY` | Gastar tu saldo | Clave nueva con la misma restricción → Vercel → publicar → borrar la vieja [G3] | Restringida a la Gemini API (7.8) |
| `DEEPGRAM_API_KEY` | Gastar tu saldo | Clave nueva → Vercel → publicar → borrar la vieja [D5] | — |
| `service_role` | Todo | No está en Vercel desde el 29/09 (ESTADO_F9 §5a). Solo vive un rato en Windows, durante el alta | Se borra al terminar (5.12) |

### 11.2 · Una cuota agotada

- **Gemini.** La cuota es por proyecto y el saldo prepago es de toda la cuenta
  [G2]. Una sola clínica con mucho tráfico puede dejar sin respuesta a las
  demás.
  - **Mitigación:** saldo con margen (7.7), respaldo al paciente (7.3) y la
    ruta de salud distinguiendo el 402 (7.1).
  - **A medio plazo:** el tope de gasto por proyecto [G2]. Un proyecto por
    clínica repartiría el riesgo, pero multiplicaría claves y variables: es
    una decisión, no se propone ahora.
- **Meta, en el modelo (a).** El límite de contactos al día es **por
  portafolio** desde el 08/10/2025 [M9]. Los recordatorios de todas las
  clínicas comparten 250 contactos al día hasta verificar el negocio, y 2.000
  después.
- **Deepgram.** El saldo es por proyecto.

### 11.3 · El reparto de costes por clínica

Lo que es de cada clínica sale de la base (§10.2). Lo fijo (Vercel, Supabase y
dominio) y la salud diaria del modelo no son de ninguna: el reparto lo decides
tú y va en el contrato como parte de la cuota, no como extra.

### 11.4 · Un error en `WHATSAPP_CLINICAS`

**Comprobado en el código, no dado por hecho.** `exigirClinicaDelCanal()`
(`almacen.ts:60-98`) lee la fila de la clínica **con el token de esa clínica** y
se niega en cinco casos:
- si no ve exactamente una clínica;
- si el id no es el del token;
- si el `wa_phone_number_id` de la fila no es el número del aviso;
- si la clínica no está activa;
- y si el id no es un uuid, que lo para antes `bot.ts:37-45`.

La usan el webhook (`procesar.ts:132`), los recordatorios
(`recordatorios.ts:179`), la retención (`retencion.ts:148`) y la ruta de salud
(`clinicas.ts:172`).

**Así que sí lo frena, y en los dos sentidos:** con un par cruzado, el bot no
contesta con los datos de otra clínica y no manda recordatorios con el nombre de
otra. Pero hay tres cosas que **no** frena, y salen de leerlo:

| Error en el mapa | Qué pasa | Dónde |
|---|---|---|
| **Un par cruzado** (el número de A apunta a B) | Antes de la comprobación, el aviso ya se ha anotado **en `eventos_webhook` de B, con el texto del paciente de A**. Esa fila solo la lee el rol bot de B, no el panel, y la carga se vacía a los 7 días. Después se niega, y **el mensaje se pierde**: Meta ya tiene su 200 | `route.ts:138-145` y `almacen.ts:89-94` |
| **Falta el par** de una clínica | El webhook contesta 200 **sin anotar nada**, y Meta no reintenta: **el mensaje del paciente se pierde sin rastro en la base**. Esa clínica tampoco manda recordatorios | `route.ts:131-135` |
| **Un JSON roto** | `mapaDeClinicas()` lanza **para todas**. Fuera de su `try`, el webhook da 500 y Meta reintenta. Los recordatorios y la retención se caen enteros. La ruta de salud lo dice como `sin_mapa`, pero pasa sola a las 06:15 UTC | `config.ts:96-105`, `route.ts:131`, `recordatorios.ts:146` y `clinicas.ts:205-206` |

**Mitigación en este plan:**
- El mapa **nunca se teclea**: se saca de la base (5.7).
- Se valida antes de mandarlo.
- Después de cada cambio, la ruta de salud se lanza a mano.
- El número de una clínica no se anuncia hasta que su par está publicado y en
  `al_dia`.

**Arreglo posible, sin hacer** (pendiente nuevo, el 26): anotar en `eventos` de
la clínica dueña del número… que es justo lo que no se sabe. Lo honrado es
contarlo como métrica global en el registro y en la ruta de salud.

### 11.5 · Una sola base y un solo sitio publicado

Una caída de Supabase o una publicación mala afectan a todas a la vez.

**Mitigación:**
- El CI entero antes de fusionar.
- El control después de cada publicación (bloque 6).
- Volver a publicar el despliegue anterior, como se hizo el 01/10 (ESTADO_F9
  §11.7) por la API.

---

## 12 · Las decisiones (tuyas), y lo que no sé

### 12.1 · Decisiones

| # | Decisión | De qué depende | Lectura del agente |
|---|---|---|---|
| **D1** | Autónomo o SL | Asesor | No le toca al agente. Con autónomo no se traspasa ninguna cuenta. Con SL se traspasan todas, y la WABA tiene que nacer en el portafolio de la SL (§3.3) |
| **D2** | Meta, modelo (a) o (b) | 3.2, D1 | (a) si Meta lo confirma por escrito. Si no, (b) y hacerse Tech Provider (§5.2) |
| **D3** | El número: migrar, coexistencia o número nuevo | La clínica | **Abierta**, a propósito (§5.3) |
| **D4** | Almacenamiento en reposo en Alemania | Antes de registrar el número | Sí: no cuesta y solo se puede activar en ese momento [M12] |
| **D5** | El acta contra producción | Tú | Sí, antes de anunciar el número (5.9) |
| **D6** | La clínica de prueba | Tú | Conservarla como control (§8.2) |
| **D7** | Qué es «un mensaje» para el cupo | Tú y el contrato | (ii), las respuestas del bot (§10.3) |
| **D8** | Deepgram en la UE (`api.eu.deepgram.com`) | Asesor | Sí, con `mip_opt_out=true` siempre (§9.2) |
| **D9** | Gemini en Vertex AI UE en vez de AI Studio | Asesor | Solo si el asesor lo exige: son cuentas, código y precios nuevos que no se han estudiado |
| **D10** | Resend, que guarda en EE. UU. | Asesor | Seguir, con el mínimo de datos de hoy |
| **D11** | GitHub Team, para que el merge se bloquee de verdad | Tú | 4 USD por usuario y mes el primer año [H1]. Con una clínica que paga, el «no se puede bloquear» del pendiente 2 deja de ser aceptable |
| **D12** | Pausar producción por gasto en Vercel | Tú | **No:** callaría a todas las clínicas (7.7) |
| **D13** | `confirmacion_cita` | Tú | Aprobarla igualmente: no cuesta, y el código ya la tiene |
| **D14** | El permiso de los pacientes | Asesor y tú | La propuesta de 3.11 |

### 12.2 · Lo que no sé, y dónde se mira

| Qué | Dónde |
|---|---|
| Deepgram: cuenta, plan, saldo y quién paga | console.deepgram.com → Billing |
| La cuenta de Google dueña del proyecto de AI Studio, y si la clave está restringida | aistudio.google.com → API keys |
| El nombre de la organización de Supabase, y si desarrollo y producción están en la misma (Free: 2 proyectos como mucho) | supabase.com → Organizations |
| La tarjeta de Vercel | vercel.com → equipo → Settings → Billing |
| El id y el nombre de la app de Meta, y si `WHATSAPP_TOKEN` es de usuario del sistema (ESTADO_F9 §12, paso 4) | developers.facebook.com → My Apps |
| Si Meta cobra ya los mensajes de servicio, y las tarifas de España | 3.1 |
| Si el modelo (a) está permitido | 3.2 |
| Qué documentos acepta Meta para verificar un negocio en España | Business Support, en la verificación |
| Si la ficha de la clínica de prueba sigue en el scratchpad de F9 | Solo hace falta si se borra la clínica (D6) |

---

## 13 · Fuentes

Leídas por el agente «investigador» y consultadas el 02/10/2026. La fecha que
acompaña a cada una es la de la propia página cuando la tiene.

> **Aviso de método:** las páginas se leyeron con una herramienta que resume, y
> las del Centro de ayuda de Meta solo devolvieron el título. Donde algo sale de
> un fragmento del buscador y no de la página, se dice. Antes de firmar nada,
> el asesor coteja las de §4 en vivo.

| Id | Qué | URL · fecha |
|---|---|---|
| M1 | Política de WhatsApp Business: permiso, baja, suplantación | whatsappbusiness.com/policy · 23/09/2026 |
| M2 | Solution Partner, Tech Provider y Tech Partner; quién paga | developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/overview y …/get-started-for-tech-providers |
| M3 | «Direct Developer»: sin acceso avanzado ni App Review | …/whatsapp/solution-providers/app-review |
| M4 | Una WABA, un portafolio; no se migra; se comparte con dos socios; moneda | …/whatsapp/whatsapp-business-accounts |
| M5 | Precio por mensaje desde el 01/07/2025; monedas | …/whatsapp/pricing · referencias hasta el 12/05/2026 |
| M5b | Modo en vivo: política, icono, categoría y borrado (resumen del buscador) | developers.facebook.com/docs/development/create-an-app/app-dashboard/ |
| M6 | **Mensajes de servicio y utility cobrados desde el 01/10/2026** | …/whatsapp/pricing/non-template-messages |
| M7 | Migrar un número de la app: borrar la cuenta y perder el historial | …/solution-providers/migrate-existing-whatsapp-number-to-a-business-account/ |
| M8 | Coexistencia: UE desde el 23/10/2025, requisitos y límites | …/embedded-signup/onboarding-business-app-users/ |
| M9 | Límites por portafolio desde el 08/10/2025; números por portafolio | …/whatsapp/messaging-limits |
| M10 | Categorías, recategorización, 24 h, plantillas por WABA | …/templates/template-categorization y …/templates/overview |
| M11 | Cómo pedir el permiso | …/whatsapp/getting-opt-in |
| M12 | Almacenamiento local (DE/CH/GB) con el número sin registrar | …/whatsapp/local-storage/ y …/business-phone-numbers/registration |
| M13 | Token de usuario del sistema | …/whatsapp/access-tokens |
| M14 | Datos de Cloud API (30 días); condiciones de tratamiento y anexo de transferencias | …/data-privacy-and-security/ · whatsapp.com/legal/business-data-processing-terms (22/08/2025) · …/business-data-transfer-addendum (16/02/2024) |
| M15 | Normas del nombre visible. **Solo fragmentos del buscador** | facebook.com/business/help/338047025165344 |
| M16 | El número tiene que «ser tuyo» | …/business-phone-numbers/phone-numbers |
| M17 | Pasar una app de portafolio: no se puede deshacer | developers.facebook.com/docs/development/create-an-app/transfer-an-app |
| M18 | PIN de 6 dígitos | …/business-phone-numbers/registration |
| M19 | Verificación: los datos tienen que coincidir con la entidad legal. **Fragmento del buscador** | facebook.com/business/help/2058515294227817 |
| M20 | Mover números entre WABAs, documentado para Solution Partners | …/solution-providers/support/migrating-phone-numbers-among-solution-partners-via-embedded-signup |
| G1 | Condiciones de la Gemini API: el EEE solo con servicios de pago; los datos en cualquier país | ai.google.dev/gemini-api/terms · 28/04/2026 |
| G2 | Facturación: prepago, 402 con el saldo a 0, tope por proyecto, niveles | ai.google.dev/gemini-api/docs/billing · 28/09/2026 |
| G3 | Claves: restricción a la Gemini API; las estándar sin restringir, rechazadas; IP fijas de Vercel a 100 USD/mes | ai.google.dev/gemini-api/docs/api-key · 25/09/2026 · vercel.com/docs/networking/static-ips · 30/06/2026 |
| G4 | Los presupuestos solo avisan | docs.cloud.google.com/billing/docs/how-to/budgets · 30/09/2026 |
| G5 | Cambiar la cuenta de facturación sin corte | docs.cloud.google.com/billing/docs/how-to/modify-project · 30/09/2026 |
| G6 | DPA de Google (encargado) | business.safety.google/processorterms · 07/05/2026 |
| G7 | 55 días para detectar abusos | ai.google.dev/gemini-api/docs/usage-policies · 09/06/2026 |
| G8 | Precios de Gemini y el cambio del 1/1/2027 | ai.google.dev/gemini-api/docs/pricing · 24/09/2026 (ESTADO_F9 §5c) y 01/10/2026 |
| G9 | La residencia en la UE, solo con Vertex AI. **Foro, no documentación** | discuss.ai.google.dev/t/gemini-api-data-zones/78584 · 22/05/2025 |
| D1 | Deepgram conserva el audio por defecto; `mip_opt_out` | developers.deepgram.com/trust-security/your-data |
| D2 | Endpoint UE, sin coste extra | deepgram.com/learn/deepgram-eu-endpoint-now-generally-available · 29/10/2025 |
| D3 | Precio de nova-3 | deepgram.com/pricing |
| D4 | DPA a petición; subencargados | deepgram.com/privacy/subprocessors |
| D5 | Roles, claves y gestión de proyectos | developers.deepgram.com/docs/working-with-roles · …/guides/deep-dives/managing-projects |
| S1 | Planes: Free se pausa a los 7 días; copias; PITR; Pro | supabase.com/pricing · supabase.com/docs/guides/platform/backups |
| S2 | Traspaso de proyectos | supabase.com/docs/guides/platform/project-transfer |
| S3 | DPA de Supabase; regiones | supabase.com/legal/dpa · 01/08/2026 · supabase.com/docs/guides/platform/regions |
| S4 | Claves nuevas y firma asimétrica | supabase.com/docs/guides/getting-started/migrating-to-new-api-keys · …/auth/signing-keys |
| V1 | Traspaso de proyectos en Vercel | vercel.com/docs/projects/transferring-projects · 08/09/2026 |
| V2 | Spend Management | vercel.com/docs/spend-management · 18/09/2026 |
| V3 | DPA y cumplimiento | vercel.com/legal/dpa · 31/03/2026 · vercel.com/docs/security/compliance · 08/09/2026 |
| V4 | Registros de ejecución | vercel.com/docs/logs/runtime · 28/08/2026 |
| R1 | Resend: los datos en EE. UU.; DPA firmado de antemano | resend.com/security/gdpr · 21/09/2026 |
| R2 | Resend: dominio, regiones y plan gratuito | resend.com/docs/add-a-domain · …/dashboard/domains/regions · resend.com/pricing |
| H1 | GitHub: traspaso, rulesets y precio de Team | docs.github.com (transferring-a-repository, about-rulesets) · github.com/pricing |
| H2 | DPA de GitHub | github.com/customer-terms/github-data-protection-agreement · oct. 2025 |
| A1 | AEPD: contenido del contrato de encargo; directrices (fecha sin verificar) | aepd.es FAQ-0238 · aepd.es/guias/guia-directrices-contratos.pdf |
| L1 | Alta censal antes de empezar; qué es empezar; actos preparatorios en el IVA | sede.agenciatributaria.gob.es, guía práctica del modelo 036 (cap. 1 y cap. 6) · 26/03/2026 · Ley del IVA art. 5.Dos (BOE-A-1992-28740) |
| L2 | El modelo 037, suprimido desde el 03/02/2025 | Orden HAC/1526/2024, boe.es BOE-A-2025-410 · 09/01/2025 |
| L3 | Contenido de la factura; el nombre comercial de una persona física | RD 1619/2012 art. 6 (BOE-A-2012-14696, consolidado al 31/03/2026) · sede.agenciatributaria.gob.es, aplicación gratuita Verifactu, emisión de facturas · 24/09/2026 |
| L4 | RETA: habitualidad; alta hasta 60 días antes | seg-social.es, Afiliación 10548/32825 y Información útil 44539/44113/44128 |
| L5 | El nombre comercial: el derecho exclusivo nace con el registro | Ley 17/2001 art. 2.1 (BOE-A-2001-23093) · folleto de la OEPM «El secreto está en la marca» |
| L6 | SL: capital de 1 €; contratos antes de inscribir (arts. 36-38) | Ley de Sociedades de Capital (BOE-A-2010-10544) |
| L7 | Verifactu hasta el 01/07/2027; factura electrónica (RD 238/2026) | sede.agenciatributaria.gob.es, nota de ampliación de plazo de Verifactu · 26/03/2026 · novedades de 2026, RD 238/2026 |
| L8 | LSSI art. 10: nombre, NIF, domicilio y correo | Ley 34/2002 (BOE-A-2002-13758) |
| L9 | Registro de actividades (menos de 250 trabajadores) y delegado de protección de datos (art. 37 RGPD, art. 34 LOPDGDD) | aepd.es FAQ-0249 y FAQ-0402 · aepd.es, página del delegado de protección de datos · 09/06/2026 |
| L10 | Reglamento de IA: art. 50 desde el 02/08/2026; definiciones del art. 3 | digital-strategy.ec.europa.eu, FAQ del art. 50 · 24/07/2026 · ai-act-service-desk.ec.europa.eu, arts. 3 y 50 · 27/07/2026 |

---

## 14 · Pendientes vivos

> La copia viva de esta lista pasa de `ESTADO_F9 §8` a este archivo, y su gemela
> sigue en `PLAN.md §11`. **Si se toca una, se toca la otra.**

**Siguen abiertos de F9** (numeración de siempre):

- **2.** El merge no está bloqueado (D11).
- **4.** `04-interruptor.spec.ts:189`.
- **5.** El punto 1 del alta, medio manual: lo mitiga 5.7.
- **7.** La cuota de Gemini: ahora es prepago (§11.2).
- **8.** El cron de cada hora: que corre lo dirá una pasada vista.
- **9.** F3b, aparcada.
- **10.** El README.
- **11.** `WHATSAPP_CLINICAS` no está en `.env.local`.
- **13.** Las claves heredadas de Supabase. **Fecha propia: 01/12/2026** (7.10).
- ~~**15.** El registro de Auth.~~ ✅ Cerrado el 02/10 por el asistente de F9:
  `disable_signup: true` en producción (`6956181`).
- **17.** La app de Meta sin publicar (3.4).
- **19.** El guardián y `getUser()` (7.10).
- **21.** La escucha de Vercel pierde líneas (7.10).
- **22.** Dos CI a la vez contra desarrollo. 🟡 Hecho en `ci.yml` (`0f468a9`,
  PR #4); falta ver dos tiradas esperándose (7.10).

**Nuevos en F10:**

- **23. 🔴 Si Gemini falla, el paciente no recibe nada** (§9.2.1). Con prepago,
  un saldo a 0 calla a todas las clínicas. → 7.3.
- **24. 🟡 La ruta de salud llama «temporal» al 402** (`salud/route.ts:64-69`).
  → 7.1.
- **25. 🔴 Deepgram conserva el audio de los pacientes por defecto**, y se llama
  sin `mip_opt_out` y fuera de la UE (`audio.ts:133`, [D1]). → 7.2.
- **26. 🟡 Un mensaje de un número sin par en el mapa se pierde sin rastro**
  (`route.ts:131-135`). Un par cruzado deja la carga en `eventos_webhook` de la
  otra clínica antes de negarse (§11.4).
- **27. 🟡 El acta dice que la purga se lleva sus apuntes de `eventos`, y no lo
  hace** (`02-acta.comprobacion.ts:21-24`). La purga no toca `eventos`.
- **28. 🔴 `coste_eur` es 0 en producción con la facturación activa**, y una sola
  tarifa para dos modelos (§10.2). → 8.3 y 8.4.
- **29. 🟡 El historial del grupo puede repetir mensajes** (`procesar.ts:298`,
  ids de una identidad global). → 7.4.
- **30. 🟡 El permiso de los pacientes no se guarda**: `consentimiento_en` no lo
  escribe nadie, y nada atiende una baja (3.11).
- **31. ⚪ Nadie comprueba en producción el token de Meta ni la clave de
  Deepgram** (§3.5). → 7.1.
- **32. 🔴 Supabase de producción en plan Free:** se pausa y no tiene copias.
  → 7.6.
- **33. 🟡 `confirmacion_cita` no la manda ningún código** (D13). Y
  `WHATSAPP_PHONE_NUMBER_ID` sigue en Vercel sin que nadie la lea (ESTADO_F9
  §11.8).
- **34. 🔴 No hay página para poner ni cambiar la contraseña.**
  - El alta saca un `action_link` de recuperación (`alta-clinica.mjs:483-494`)
    que no atiende nada de `src/`.
  - Ningún propietario puede entrar en su panel: **bloquea el alta de
    cualquier clínica.**
  - Avisado por el asistente de F9 el 05/10 y comprobado en el código el mismo
    día. Lo construye ese asistente en una rama propia tras el PR #4 (§7.2,
    5.6).
  - Requisito previo de 5.4.
