-- =============================================================================
-- F1 · 007 · Integridad entre inquilinos y cierre del dato de salud
-- =============================================================================
-- Esta migracion corrige cuatro cosas que la auditoria de seguridad encontro
-- despues de escribir las seis primeras. No reescribe ninguna: el historial de
-- migraciones aplicadas se queda limpio y auditable.
--
-- CORRECCION A UNA AFIRMACION DE LA MIGRACION 006. Su cabecera dice que el
-- historial de WhatsApp desaparece a los 90 dias y que por eso el sistema no
-- trata datos de salud. Eso era falso por dos sitios:
--
--   1. `eventos_webhook.carga` guarda el cuerpo crudo que manda Meta, con el
--      texto literal del paciente dentro, y la purga no lo tocaba nunca.
--   2. `escalados.resumen` era texto libre escrito por el modelo, y `escalados`
--      sobrevive al borrado a proposito. "Le duele el 26 y tiene la cara
--      hinchada" es Art. 9 del RGPD y se quedaba ahi para siempre.
--
-- Despues de esta migracion la afirmacion se sostiene:
--   · el detalle clinico solo existe en `mensajes`, que se purga a los 90 dias;
--   · `escalados` guarda vocabulario cerrado y un PUNTERO al mensaje, que se
--     queda en null cuando el mensaje se purga;
--   · `eventos_webhook` conserva la clave de idempotencia para siempre pero
--     pierde la carga a los 7 dias.
--
-- Lo que NO se toca, por estar en la lista de "no tocar sin confirmacion" de
-- .claude/CLAUDE.md y por no hacer falta: el constraint `sin_solape` de `citas`
-- y las politicas RLS de la migracion 004.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0 · Requisito de version
-- -----------------------------------------------------------------------------
-- Mas abajo se usa `on delete set null (columna)`, que acota el SET NULL a una
-- sola columna de una clave foranea compuesta. Sin esa forma, Postgres pondria
-- a null tambien `clinica_id`, que es NOT NULL, y el borrado fallaria siempre.
-- Es sintaxis de PostgreSQL 15. Supabase aprovisiona 17, pero mejor un error
-- legible que un error de sintaxis a 200 lineas de aqui.
-- -----------------------------------------------------------------------------
do $$
begin
  if current_setting('server_version_num')::int < 150000 then
    raise exception using
      message = 'La migracion 007 necesita PostgreSQL 15 o superior.',
      detail  = format('Version del servidor: %s. Hace falta `on delete set null (columna)`.',
                       current_setting('server_version')),
      hint    = 'Actualiza el proyecto de Supabase antes de aplicar esta migracion.';
  end if;
end $$;


-- =============================================================================
-- 1 · escalados: el resumen deja de ser texto libre
-- =============================================================================
-- Mismo patron que `citas.motivo_cerrado`, no uno nuevo: se reutiliza el enum
-- `public.motivo_visita`. `escalados.motivo` sigue diciendo POR QUE hubo que
-- avisar al equipo (es `motivo_escalado`); `asunto` dice DE QUE iba, con el
-- mismo vocabulario cerrado que ya usa la agenda.
--
-- El detalle de verdad no se pierde, cambia de sitio: `mensaje_id` apunta al
-- mensaje que disparo el escalado. Recepcion lo abre y lee la conversacion
-- entera mientras exista. Cuando la purga se lleva el mensaje a los 90 dias, el
-- puntero se queda en null y el escalado sobrevive sin una sola palabra de
-- salud dentro. Eso es lo que hace que el dato viva en UN solo sitio, y que ese
-- sitio sea el que se borra.
-- -----------------------------------------------------------------------------

alter table public.escalados
  add column if not exists asunto public.motivo_visita not null default 'otro';

alter table public.escalados
  add column if not exists mensaje_id bigint;

-- El texto libre se va. Se hace ahora, antes de que exista la primera clinica:
-- no hay ninguna fila que migrar. Si algun dia hubiera que repetirlo sobre una
-- base con datos, esto es un borrado y hay que decirlo por escrito antes.
alter table public.escalados drop column if exists resumen;

comment on table public.escalados is
  'Cola de recepcion. Ni una columna de texto libre: `motivo` y `asunto` son enums, y el detalle clinico se consulta siguiendo `mensaje_id` mientras el mensaje exista. Esta tabla sobrevive a la purga de 90 dias; su contenido no puede.';

comment on column public.escalados.asunto is
  'Vocabulario cerrado, mismo enum que citas.motivo_cerrado. Nunca texto libre: es lo que mantiene el sistema fuera del Art. 9 del RGPD.';

comment on column public.escalados.mensaje_id is
  'Puntero al mensaje que disparo el escalado. ON DELETE SET NULL: cuando la purga de 90 dias se lleva el mensaje, el escalado se queda sin detalle clinico y sigue sirviendo como registro de que hubo que avisar al equipo.';


-- =============================================================================
-- 2 · Claves unicas compuestas en las tablas padre
-- =============================================================================
-- Son el punto de apoyo de las claves foraneas compuestas de la seccion 3. Una
-- FK solo puede apuntar a un conjunto de columnas con indice unico.
-- =============================================================================

do $$
declare
  t text;
begin
  foreach t in array array['pacientes', 'tratamientos', 'gabinetes', 'conversaciones', 'mensajes']
  loop
    if not exists (
      select 1 from pg_constraint
      where conname = t || '_id_clinica_key'
        and connamespace = 'public'::regnamespace
    ) then
      execute format(
        'alter table public.%I add constraint %I unique (id, clinica_id)',
        t, t || '_id_clinica_key'
      );
    end if;
  end loop;
end $$;


-- =============================================================================
-- 3 · Claves foraneas compuestas: el clinica_id viaja con la referencia
-- =============================================================================
-- EL AGUJERO QUE CIERRA. Hasta ahora, `citas.gabinete_id` solo comprobaba que
-- el gabinete existiera, no que fuera de la misma clinica. La RLS deja pasar la
-- fila porque mira `citas.clinica_id`, que si es el tuyo. Resultado: se podia
-- crear una cita propia ocupando el sillon del vecino, y como `sin_solape` es
-- global por gabinete, le bloqueaba la agenda a esa hora. El `{motivo:'ocupado'}`
-- de `crear_cita` funcionaba ademas como oraculo para sondear su ocupacion.
--
-- POR QUE ESTO Y NO METER clinica_id EN EL EXCLUDE DE sin_solape. Era la otra
-- propuesta y es peor: si `sin_solape` pasara a comparar tambien por clinica,
-- una cita de A alojada en el gabinete de B dejaria de chocar con las citas
-- reales de B. Se cambiaria un bloqueo ruidoso por una doble reserva silenciosa
-- en un sillon de verdad, con dos pacientes presentandose a la misma hora. Con
-- la clave compuesta la fila mala no llega a existir, y `sin_solape` se queda
-- exactamente como esta.
--
-- POR QUE `no action` Y NO `restrict`. Los dos impiden borrar la fila padre,
-- pero RESTRICT comprueba de inmediato y NO ACTION al final de la sentencia.
-- Al dar de baja una clinica, el ON DELETE CASCADE de `clinica_id` borra a la
-- vez tratamientos, gabinetes y citas; con RESTRICT la comprobacion salta antes
-- de que se hayan borrado las citas y la baja falla. Con NO ACTION, al final de
-- la sentencia ya no queda ninguna cita apuntando y pasa. Es la diferencia
-- entre poder dar de baja una clinica y no poder.
-- =============================================================================

-- 3.1 · Fuera las claves foraneas de una sola columna que vamos a sustituir.
--       Se buscan por catalogo y no por nombre: Postgres las autonombra y no
--       quiero que la migracion dependa de haber adivinado bien el sufijo.
do $$
declare
  r record;
begin
  for r in
    select con.conname, c.relname
    from pg_constraint con
    join pg_class     c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where con.contype = 'f'
      and n.nspname   = 'public'
      and array_length(con.conkey, 1) = 1
      and (
        c.relname,
        (select a.attname
         from pg_attribute a
         where a.attrelid = con.conrelid and a.attnum = con.conkey[1])
      ) in (
        ('conversaciones', 'paciente_id'),
        ('tratamientos',   'gabinete_id'),
        ('citas',          'paciente_id'),
        ('citas',          'tratamiento_id'),
        ('citas',          'gabinete_id'),
        ('citas',          'conversacion_id'),
        ('mensajes',       'conversacion_id'),
        ('escalados',      'conversacion_id')
      )
  loop
    execute format('alter table public.%I drop constraint %I', r.relname, r.conname);
  end loop;
end $$;


-- 3.2 · Y en su lugar, las compuestas.
do $$
declare
  f record;
begin
  for f in
    select * from (values
      -- hija,            columna,           padre,            on delete
      ('conversaciones', 'paciente_id',     'pacientes',      'set null (paciente_id)'),
      ('tratamientos',   'gabinete_id',     'gabinetes',      'set null (gabinete_id)'),
      -- Las tres de citas van a NO ACTION. Antes `paciente_id` era CASCADE:
      -- borrar un paciente se llevaba por delante sus citas, saltandose los dos
      -- cerrojos (ninguna politica de DELETE sobre citas, y el GRANT revocado).
      -- Una regla de seguridad que solo existia en el papel.
      ('citas',          'paciente_id',     'pacientes',      'no action'),
      ('citas',          'tratamiento_id',  'tratamientos',   'no action'),
      ('citas',          'gabinete_id',     'gabinetes',      'no action'),
      ('citas',          'conversacion_id', 'conversaciones', 'set null (conversacion_id)'),
      -- Esta se queda en CASCADE a proposito: es como la purga de 90 dias se
      -- lleva los mensajes al borrar la conversacion.
      ('mensajes',       'conversacion_id', 'conversaciones', 'cascade'),
      ('escalados',      'conversacion_id', 'conversaciones', 'set null (conversacion_id)'),
      ('escalados',      'mensaje_id',      'mensajes',       'set null (mensaje_id)')
    ) as v(hija, columna, padre, al_borrar)
  loop
    if not exists (
      select 1 from pg_constraint
      where conname = format('%s_%s_clinica_fkey', f.hija, f.columna)
        and connamespace = 'public'::regnamespace
    ) then
      execute format(
        'alter table public.%I add constraint %I
           foreign key (%I, clinica_id)
           references public.%I (id, clinica_id)
           on update cascade on delete %s',
        f.hija,
        format('%s_%s_clinica_fkey', f.hija, f.columna),
        f.columna,
        f.padre,
        f.al_borrar
      );
    end if;
  end loop;
end $$;


-- 3.3 · Indices de las claves foraneas nuevas.
--       Postgres no los crea solo, y sin ellos cada borrado en la tabla padre
--       recorre la hija entera. Los de una sola columna que quedan cubiertos
--       por el prefijo de estos se retiran para no pagar dos veces cada INSERT.
create index if not exists conversaciones_paciente_clinica_idx
  on public.conversaciones (paciente_id, clinica_id);
create index if not exists tratamientos_gabinete_clinica_idx
  on public.tratamientos (gabinete_id, clinica_id);
create index if not exists citas_paciente_clinica_idx
  on public.citas (paciente_id, clinica_id);
create index if not exists citas_tratamiento_clinica_idx
  on public.citas (tratamiento_id, clinica_id);
create index if not exists citas_gabinete_clinica_idx
  on public.citas (gabinete_id, clinica_id);
create index if not exists citas_conversacion_clinica_idx
  on public.citas (conversacion_id, clinica_id);
create index if not exists mensajes_conversacion_clinica_idx
  on public.mensajes (conversacion_id, clinica_id);
create index if not exists escalados_conversacion_clinica_idx
  on public.escalados (conversacion_id, clinica_id);
create index if not exists escalados_mensaje_clinica_idx
  on public.escalados (mensaje_id, clinica_id);

drop index if exists public.conversaciones_paciente_id_idx;
drop index if exists public.tratamientos_gabinete_id_idx;
drop index if exists public.citas_paciente_id_idx;
drop index if exists public.citas_tratamiento_id_idx;
drop index if exists public.citas_gabinete_id_idx;
drop index if exists public.citas_conversacion_id_idx;
drop index if exists public.escalados_conversacion_id_idx;
-- `mensajes_conversacion_idx` es (conversacion_id, creado_en) y NO es
-- redundante: es el que ordena el historial de una conversacion. Se queda.


-- =============================================================================
-- 4 · La purga se lleva tambien la carga cruda de Meta
-- =============================================================================
-- `eventos_webhook.carga` es el JSON tal cual lo manda Meta, con el texto del
-- paciente dentro. Solo hace falta para depurar un fallo reciente; la
-- idempotencia la da `wa_event_id`, que ocupa nada y se queda para siempre.
--
-- Por eso no se borra la fila a los 7 dias: se le quita la carga. Asi un
-- reintento de Meta seis meses despues sigue reconociendose como duplicado,
-- pero sin guardar ni una palabra de lo que escribio nadie.
--
-- La firma de la funcion cambia (un parametro mas), asi que hay que soltar la
-- anterior: `create or replace` crearia una sobrecarga y el job seguiria
-- llamando a la vieja.
-- =============================================================================

drop function if exists mantenimiento.purgar_historial(integer, integer);

create or replace function mantenimiento.purgar_historial(
  p_dias        integer default 90,
  p_lote        integer default 5000,
  p_dias_cargas integer default 7
)
returns table (
  conversaciones_borradas bigint,
  mensajes_borrados       bigint,
  cargas_vaciadas         bigint,
  eventos_borrados        bigint
)
language plpgsql
security invoker
set search_path = ''
as $func$
declare
  v_corte        timestamptz := now() - make_interval(days => p_dias);
  v_corte_cargas timestamptz := now() - make_interval(days => p_dias_cargas);
  v_n            bigint;
begin
  -- Cinturon: si un lote se atasca, muere el job, no la base de datos.
  perform set_config('statement_timeout', '60s', true);

  conversaciones_borradas := 0;
  mensajes_borrados       := 0;
  cargas_vaciadas         := 0;
  eventos_borrados        := 0;

  -- 1. Conversaciones inactivas. Sus mensajes caen en cascada, y los escalados
  --    que las citaban se quedan con conversacion_id y mensaje_id en null.
  loop
    delete from public.conversaciones
    where id in (
      select id
      from public.conversaciones
      where ultima_actividad < v_corte
      limit p_lote
    );
    get diagnostics v_n = row_count;
    conversaciones_borradas := conversaciones_borradas + v_n;
    exit when v_n = 0;
  end loop;

  -- 2. Mensajes antiguos de conversaciones que siguen vivas. Una conversacion
  --    activa hoy puede arrastrar mensajes de hace cuatro meses, y esos tambien
  --    se van: el plazo es del mensaje, no del hilo.
  loop
    delete from public.mensajes
    where id in (
      select id
      from public.mensajes
      where creado_en < v_corte
      limit p_lote
    );
    get diagnostics v_n = row_count;
    mensajes_borrados := mensajes_borrados + v_n;
    exit when v_n = 0;
  end loop;

  -- 3. La carga cruda de Meta, a los 7 dias. La fila se queda; el contenido no.
  loop
    update public.eventos_webhook
    set carga = null
    where id in (
      select id
      from public.eventos_webhook
      where carga is not null
        and recibido_en < v_corte_cargas
      limit p_lote
    );
    get diagnostics v_n = row_count;
    cargas_vaciadas := cargas_vaciadas + v_n;
    exit when v_n = 0;
  end loop;

  -- 4. Y a los 90 dias, la fila entera: pasado ese plazo Meta ya no reintenta
  --    nada y la clave de idempotencia solo ocupa sitio.
  loop
    delete from public.eventos_webhook
    where id in (
      select id
      from public.eventos_webhook
      where recibido_en < v_corte
      limit p_lote
    );
    get diagnostics v_n = row_count;
    eventos_borrados := eventos_borrados + v_n;
    exit when v_n = 0;
  end loop;

  -- Tras un borrado grande las estadisticas quedan desfasadas y el planificador
  -- empieza a elegir mal.
  analyze public.mensajes;
  analyze public.conversaciones;
  analyze public.eventos_webhook;

  return next;
end;
$func$;

comment on function mantenimiento.purgar_historial(integer, integer, integer) is
  'Purga de retencion. Borra conversaciones y mensajes de mas de p_dias dias, vacia eventos_webhook.carga a los p_dias_cargas dias y borra la fila entera a los p_dias, todo en lotes de p_lote filas. SECURITY INVOKER: lo ejecuta pg_cron como postgres, que ya tiene BYPASSRLS. No es alcanzable por la API porque el esquema mantenimiento no esta publicado.';

revoke all on function mantenimiento.purgar_historial(integer, integer, integer)
  from public, anon, authenticated;
grant execute on function mantenimiento.purgar_historial(integer, integer, integer) to postgres;

comment on column public.eventos_webhook.carga is
  'Cuerpo crudo del webhook de Meta, con el texto del paciente dentro. Se pone a null a los 7 dias. La idempotencia no depende de esta columna sino de wa_event_id, que se conserva.';

-- El job vuelve a programarse porque la firma que llamaba ya no existe.
do $do$
begin
  if exists (select 1 from cron.job where jobname = 'purgar-historial-90-dias') then
    perform cron.unschedule('purgar-historial-90-dias');
  end if;

  perform cron.schedule(
    'purgar-historial-90-dias',
    '15 3 * * *',
    $cmd$ select mantenimiento.purgar_historial(90, 5000, 7) $cmd$
  );
end $do$;


-- =============================================================================
-- 5 · El GRANT que `anon` no recibia de Supabase sino de PUBLIC
-- =============================================================================
-- La migracion 004 revoca los privilegios de `anon` sobre `public`, incluido
-- `execute` sobre las funciones. Pero en Postgres toda funcion nace con EXECUTE
-- concedido a PUBLIC, y PUBLIC incluye a `anon`: revocarle a `anon` lo que
-- tiene por ser PUBLIC no le quita nada. Las dos funciones de la migracion 005
-- estan bien cerradas porque llevan su `revoke ... from public` a mano, pero
-- cualquier funcion que se anada a `public` a partir de ahora naceria
-- ejecutable con la clave anonima.
--
-- Esto lo cierra de raiz, para las que hay y para las que vengan.
-- =============================================================================

revoke execute on all functions in schema public from public;
alter default privileges in schema public revoke execute on functions from public;

-- Las dos del bot y el panel siguen necesitando su permiso explicito.
grant execute on function public.consultar_huecos(uuid, uuid, timestamptz, timestamptz, integer)
  to authenticated;
grant execute on function public.crear_cita(uuid, uuid, uuid, timestamptz, public.motivo_visita, uuid, uuid, boolean, integer)
  to authenticated;
