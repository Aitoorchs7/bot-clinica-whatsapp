-- =============================================================================
-- F1 · 006 · Retencion a 90 dias
-- =============================================================================
-- El historial de WhatsApp se borra a los tres meses. No es una politica de
-- limpieza: es lo que permite decir por escrito que el bot NO trata datos de
-- salud. Si un paciente cuenta por WhatsApp que toma anticoagulantes, eso vive
-- en `mensajes` y desaparece a los 90 dias; a su ficha no pasa nunca, porque el
-- motivo de la visita es vocabulario cerrado.
--
-- Que sobrevive al borrado, y es deliberado:
--   citas      -> conversacion_id es ON DELETE SET NULL. La agenda no se toca.
--   escalados  -> igual. El registro de que hubo que avisar al equipo se queda.
--   pacientes  -> la ficha es un dato de contacto, no una conversacion.
-- =============================================================================

create schema if not exists mantenimiento;

-- Esquema privado: PostgREST solo publica `public` y `graphql_public`, asi que
-- nada de aqui es alcanzable con .rpc().
revoke all on schema mantenimiento from public;

comment on schema mantenimiento is
  'Esquema privado, no publicado por PostgREST. Tareas programadas que ejecuta pg_cron como el rol postgres. Nada de aqui debe ser llamable desde la API.';


-- -----------------------------------------------------------------------------
-- purgar_historial
-- -----------------------------------------------------------------------------
-- SECURITY INVOKER, no DEFINER. pg_cron ejecuta cada job con la identidad del
-- rol que lo programo, que aqui es `postgres`, y `postgres` tiene BYPASSRLS:
-- no necesita que nadie le eleve privilegios. Asi el proyecto entero se queda
-- sin una sola funcion SECURITY DEFINER, que es justo lo que pide
-- .claude/CLAUDE.md.
--
-- Borrado POR LOTES. Un `delete from mensajes where creado_en < ...` de golpe
-- sobre una tabla de millones de filas sostiene un lock durante minutos y deja
-- a los webhooks esperando. En lotes de 5000 cada sentencia dura milisegundos.
-- -----------------------------------------------------------------------------
create or replace function mantenimiento.purgar_historial(
  p_dias integer default 90,
  p_lote integer default 5000
)
returns table (
  conversaciones_borradas bigint,
  mensajes_borrados       bigint
)
language plpgsql
security invoker
set search_path = ''
as $func$
declare
  v_corte timestamptz := now() - make_interval(days => p_dias);
  v_n     bigint;
begin
  -- Cinturon: si un lote se atasca, muere el job, no la base de datos.
  perform set_config('statement_timeout', '60s', true);

  conversaciones_borradas := 0;
  mensajes_borrados       := 0;

  -- 1. Conversaciones inactivas. Sus mensajes caen en cascada.
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

  -- Tras un borrado grande las estadisticas quedan desfasadas y el planificador
  -- empieza a elegir mal.
  analyze public.mensajes;
  analyze public.conversaciones;

  return next;
end;
$func$;

comment on function mantenimiento.purgar_historial(integer, integer) is
  'Borra conversaciones y mensajes de mas de p_dias dias, en lotes de p_lote filas. SECURITY INVOKER: lo ejecuta pg_cron como postgres, que ya tiene BYPASSRLS. No es alcanzable por la API porque el esquema mantenimiento no esta publicado.';

-- Ni la API ni ningun usuario la ejecutan. Solo el rol del cron.
revoke all on function mantenimiento.purgar_historial(integer, integer)
  from public, anon, authenticated;
grant usage on schema mantenimiento to postgres;
grant execute on function mantenimiento.purgar_historial(integer, integer) to postgres;


-- -----------------------------------------------------------------------------
-- El job
-- -----------------------------------------------------------------------------
-- Todos los dias a las 03:15. pg_cron interpreta el cron en UTC, no en la zona
-- de la clinica; para una tarea de limpieza da igual, y a esa hora no hay
-- nadie escribiendo por WhatsApp en ninguna de las dos.
--
-- pg_cron solo corre en la base de datos `postgres`, que es la de Supabase.
-- -----------------------------------------------------------------------------
do $do$
begin
  if exists (select 1 from cron.job where jobname = 'purgar-historial-90-dias') then
    perform cron.unschedule('purgar-historial-90-dias');
  end if;

  perform cron.schedule(
    'purgar-historial-90-dias',
    '15 3 * * *',
    $cmd$ select mantenimiento.purgar_historial(90, 5000) $cmd$
  );
end $do$;
