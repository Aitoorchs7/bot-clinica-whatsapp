-- =============================================================================
-- F7 · 010 · El borrador sobrevive entre mensajes
-- =============================================================================
-- POR QUE EXISTE ESTA MIGRACION
--
-- Porque hasta hoy NO SE COGIAN CITAS, y nadie lo sabia.
--
-- `responder()` (F3) admite un `borrador` y unas `rondasDeAclaracion` de
-- entrada, y devuelve los dos actualizados. `procesar.ts` (F4) nunca se los
-- paso: llamaba con el historial y nada mas. Asi que cada mensaje de WhatsApp
-- empezaba con el borrador VACIO.
--
-- Medido con la convencion exacta del canal, una cita pedida en cuatro
-- mensajes:
--
--     crear_cita -> {"ok": false, "motivo": "faltan_datos",
--                    "porque": "todavia falta el nombre, los apellidos,
--                               un telefono, el tratamiento"}
--     citas creadas -> 0
--
-- Y NO SE ARREGLA PIDIENDOLE AL MODELO QUE VUELVA A ANOTAR, porque el bloque
-- 50 se lo prohibe expresamente:
--
--     «Cada vez que el paciente te de uno, llama a anotar con ese dato, y solo
--      con ese. NUNCA ANOTES ALGO QUE EL PACIENTE NO ACABE DE DECIR.»
--
-- Un paciente que dijo su nombre hace tres mensajes no lo «acaba de decir»
-- cuando escribe «si». El modelo que OBEDECE sus instrucciones no reserva, y
-- el que reserva es uno que las desobedece. El prompt y el canal se
-- contradecian y ganaba el canal.
--
-- POR QUE EN `conversaciones` Y NO EN OTRO SITIO
--
--   · Es lo que dura lo que tiene que durar el borrador: una conversacion.
--     `pacientes` no vale — el borrador es justo lo que TODAVIA NO es un
--     paciente, y escribirlo alli dejaria fichas de gente que empezo a pedir
--     cita y se fue. Esa distincion es de V1 y la explica `herramientas.ts`.
--   · `conversaciones` SI la purga `purgar_historial` a los 90 dias. Un dato a
--     medias no puede vivir en una tabla que no se purga nunca, que es el
--     motivo por el que `recordatorios` y `auditoria` no llevan texto libre.
--   · Y el bot ya escribe en esta tabla desde F4 (`guardarVentana`), asi que
--     no hace falta ensanchar el alcance del rol para nada.
--
-- QUE HACE Y QUE NO HACE
--
-- SOLO AÑADE DOS COLUMNAS. No crea tablas, no toca `sin_solape`, no crea
-- politicas, no modifica ninguna existente y no relaja nada. No hay ninguna
-- funcion SECURITY DEFINER aqui ni en el resto del proyecto.
--
-- No hace falta politica nueva y se comprobo antes de escribir esto, no
-- despues: `conversaciones_bot_update` (migracion 004) no lleva lista de
-- columnas, y en todo `supabase/migrations/` no hay un solo `grant` por
-- columna. Una columna nueva entra en el alcance de la politica que ya existe.
--
-- Aun asi, ESO SE LEYO EN EL SQL, QUE NO ES LO MISMO QUE COMPROBARLO. Lo mide
-- contra la base `tests/whatsapp-vivo`, escribiendo con el cliente del bot y
-- mirando las filas afectadas. El motivo es el de la 009: un UPDATE que no
-- alcanza ninguna fila devuelve CERO FILAS Y NINGUN ERROR. Si la politica no
-- dejara, el borrador se guardaria «bien» sin guardarse y cada mensaje
-- volveria a creerse el primero — el sintoma de hoy, pero ya sin nadie
-- mirando.
--
-- Este archivo esta sujeto a la regla de «no tocar sin confirmacion explicita»
-- de .claude/CLAUDE.md, y esa confirmacion se pidio y se dio antes de
-- escribirlo, igual que con la 008 de F5 y la 009 de F6.
-- =============================================================================


-- =============================================================================
-- 1 · borrador  —  lo que se sabe de la cita antes de escribirla
-- =============================================================================
-- NO ES UNA FILA DE `citas` NI UNA DE `pacientes`, y por eso es `jsonb` y no
-- seis columnas: mientras la cita esta a medias no existe en ningun sitio.
-- Darle columnas propias invitaria a consultarlo como si fuera una agenda, y
-- lo que hay aqui es una conversacion sin terminar.
--
-- LO QUE PUEDE LLEVAR DENTRO, Y LO QUE NO
--
-- Los siete campos de `Borrador` (herramientas.ts): quien_llama, nombre,
-- apellidos, telefono, tratamiento_id/_nombre, dia, motivo y hora.
--
-- `motivo` es el enum `motivo_visita` —vocabulario cerrado—, que es lo que
-- mantiene esto fuera del articulo 9 del RGPD igual que en `citas`. AQUI NO
-- ENTRA TEXTO LIBRE DEL PACIENTE, y quien anada un campo nuevo a `Borrador`
-- tiene que mirar esta linea antes: lo que se escriba aqui es un dato de la
-- conversacion, no lo que el paciente contó.
alter table public.conversaciones
  add column if not exists borrador jsonb not null default '{}'::jsonb;

comment on column public.conversaciones.borrador is
  'Lo que se sabe de la cita antes de escribirla, entre un mensaje de WhatsApp y el siguiente. Es el `Borrador` de src/lib/bot/herramientas.ts. Se vacia solo al reservar (crear_cita deja el telefono y nada mas) y desaparece con la conversacion a los 90 dias. NI UN CAMPO DE TEXTO LIBRE: `motivo` es el enum motivo_visita, igual que en citas.';


-- =============================================================================
-- 2 · rondas_aclaracion  —  «una sola ronda, nunca un bucle»
-- =============================================================================
-- `RONDAS_MAXIMAS` es 1 desde F3 y no se aplicaba NUNCA, porque el contador
-- llegaba siempre a cero. O sea que `no_te_entiendo` jamas devolvia
-- {escalar: true} y el bot podia pedir que le repitieran la frase
-- indefinidamente: el bucle de aclaracion que `.claude/CLAUDE.md` prohibe por
-- su nombre y que es el anti-patron que mas rapido quema a una clinica.
--
-- `smallint` y no `integer` porque el valor util es 0, 1 o 2. Sin CHECK a
-- proposito: el limite es de producto (RONDAS_MAXIMAS, en codigo) y puede
-- cambiar sin una migracion; un CHECK aqui lo congelaria en el esquema.
alter table public.conversaciones
  add column if not exists rondas_aclaracion smallint not null default 0;

comment on column public.conversaciones.rondas_aclaracion is
  'Cuantas veces se ha pedido ya una aclaracion en esta conversacion. Lo compara `no_te_entiendo` contra RONDAS_MAXIMAS: pasado el tope escala a recepcion en vez de volver a preguntar. Sin esta columna el contador llegaba siempre a 0 y el tope no se aplicaba nunca.';
