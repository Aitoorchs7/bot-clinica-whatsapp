-- =============================================================================
-- F6 · 009 · Los trabajos programados
-- =============================================================================
-- POR QUE EXISTE ESTA MIGRACION
--
-- F6 es la primera fase que manda mensajes SOLA, sin que nadie escriba primero.
-- Eso trae dos cosas que la base de datos no sabia hacer todavia, y las dos se
-- midieron contra el proyecto de desarrollo antes de escribir una linea.
--
--   1 · DONDE SE MARCA QUE UN RECORDATORIO YA SALIO
--
--      `citas` no tiene columna para eso, y anadirsela NO habria servido: el
--      rol `bot` no puede tocar una cita confirmada. `citas_bot_update` lleva
--      `estado = 'provisional'` en su USING, asi que el UPDATE no alcanza
--      ninguna fila. Medido:
--
--          UPDATE de una cita confirmada -> filas=0  error=ninguno
--
--      CERO FILAS Y NINGUN ERROR. Una marca que se escribe en silencio sin
--      escribirse es la peor de las dos opciones: cada invocacion del cron se
--      creeria la primera y el recordatorio saldria una y otra vez. Para que
--      funcionara habria que ensanchar `citas_bot_update`, que es justo la
--      politica que hoy mantiene al bot lejos de las citas confirmadas.
--
--      `eventos` tampoco vale: el bot puede insertar, pero no hay indice unico
--      y admite dos filas identicas. Medido: las dos se crearon.
--
--      Asi que una tabla nueva, con `unique (clinica_id, cita_id)`. El `23505`
--      ES la deteccion, igual que en `eventos_webhook` (ESTADO_F4 §5.4): el
--      unico sitio donde dos invocaciones concurrentes se ponen de acuerdo es
--      la base de datos.
--
--   2 · QUIEN LIBERA UNA PROVISIONAL CADUCADA
--
--      El bot NO puede. `citas_bot_update` admite `provisional -> confirmada`
--      y nada mas. Medido:
--
--          provisional -> cancelada  -> 42501, new row violates RLS policy
--          provisional -> confirmada -> filas=1
--
--      Y hace falta de verdad, porque una provisional caducada SIGUE TAPANDO EL
--      HUECO: `consultar_huecos` excluye las citas en estado provisional,
--      confirmada o completada sin mirar `expira_en`. Medido sobre la rejilla:
--
--          hueco ofrecido -> antes=1  con provisional caducada=0  tras cancelar=1
--
--      La salida no es ensanchar la politica del bot: es que no haga falta
--      ninguna identidad de inquilino. `pg_cron` ejecuta sus jobs como
--      `postgres`, que ya tiene BYPASSRLS, asi que la funcion es
--      SECURITY INVOKER y vive en el esquema privado `mantenimiento`, que
--      PostgREST no publica. Exactamente como `purgar_historial` desde F1.
--
--      De paso, esa es la respuesta a «de que clinica es un cron»: este no es
--      de ninguna. Es mantenimiento de la base, no camino del bot.
--
-- QUE HACE Y QUE NO HACE
--
-- Solo AÑADE. No toca, no reescribe y no relaja ninguna politica existente. No
-- toca `sin_solape`. No hay ni una funcion SECURITY DEFINER, ni aqui ni en el
-- resto del proyecto.
--
-- Este archivo esta sujeto a la regla de "no tocar sin confirmacion explicita"
-- de .claude/CLAUDE.md, y esa confirmacion se pidio y se dio antes de
-- escribirlo, igual que con la 008 de F5.
-- =============================================================================


-- =============================================================================
-- 1 · citas gana la clave unica compuesta
-- =============================================================================
-- Es el punto de apoyo de la clave foranea compuesta de `recordatorios`. La
-- 007 se la puso a las cinco tablas que entonces eran padre de alguien;
-- `citas` no lo era de nadie y se quedo fuera. Ahora si lo es.
--
-- Solo anade un indice unico sobre una pareja que YA era unica (`id` es la
-- clave primaria). No cambia el comportamiento de ninguna consulta.
-- =============================================================================
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'citas_id_clinica_key'
      and connamespace = 'public'::regnamespace
  ) then
    alter table public.citas add constraint citas_id_clinica_key unique (id, clinica_id);
  end if;
end $$;


-- =============================================================================
-- 2 · recordatorios  —  la marca de que un recordatorio ya salio
-- =============================================================================
-- UNA FILA POR CITA, Y LA BASE LO GARANTIZA.
--
-- No guarda el motivo de la visita, ni el nombre del paciente, ni el texto que
-- se mando. Es la misma doctrina que `auditoria` y que `origen.ts` desde F2: se
-- nombra la fila, no se repite lo que hay dentro. Aqui ademas importa el doble,
-- porque esta tabla NO la purga nadie: `purgar_historial` se lleva
-- conversaciones, mensajes y cargas de webhook, y esta no esta en la lista.
-- Lo que se escriba aqui se queda para siempre, asi que no puede llevar dentro
-- una palabra de salud.
--
-- El texto que se le mando al paciente SI se guarda, pero en `mensajes`, que es
-- la tabla que se borra a los 90 dias.
-- =============================================================================
-- NO HAY COLUMNA `wa_message_id` AQUI, Y SE PENSO PONERLA. No cabe: la marca
-- se coge ANTES de mandar, asi que en ese momento Meta todavia no ha devuelto
-- ningun wamid, y despues no se puede escribir porque esta tabla no tiene
-- politica de UPDATE para nadie. Una columna que no se puede rellenar nunca es
-- peor que no tenerla: el primero que la lea creera que el hueco significa algo.
-- El wamid del recordatorio vive en `mensajes`, que es donde viven todos.
create table if not exists public.recordatorios (
  id            bigint      generated always as identity primary key,
  clinica_id    uuid        not null references public.clinicas(id) on delete cascade,
  cita_id       uuid        not null,
  enviado_en    timestamptz not null default now(),
  -- LA LINEA. Dos invocaciones del cron a la vez y solo una escribe; la otra se
  -- lleva un 23505 y se calla. Sin esto, el recordatorio se manda dos veces y
  -- el paciente llama a recepcion a preguntar cual es la buena.
  unique (clinica_id, cita_id)
);
alter table public.recordatorios enable row level security;

-- La clave foranea compuesta de la 007: el clinica_id viaja con la referencia,
-- asi que una fila de la clinica A no puede apuntar a una cita de la B.
-- ON DELETE CASCADE: si la cita desaparece, su marca no tiene sentido.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'recordatorios_cita_clinica_fkey'
      and connamespace = 'public'::regnamespace
  ) then
    alter table public.recordatorios
      add constraint recordatorios_cita_clinica_fkey
      foreign key (cita_id, clinica_id)
      references public.citas (id, clinica_id)
      on update cascade on delete cascade;
  end if;
end $$;

create index if not exists recordatorios_cita_clinica_idx
  on public.recordatorios (cita_id, clinica_id);

comment on table public.recordatorios is
  'Marca de que el recordatorio de una cita ya se mando. El unique (clinica_id, cita_id) es la garantia de que no sale dos veces, tambien con dos invocaciones del cron a la vez: el 23505 ES la deteccion. Ni una columna de texto libre: esta tabla NO la purga nadie.';

comment on column public.recordatorios.enviado_en is
  'Cuando se COGIO la marca, que es justo antes de mandar. Si el envio falla despues, la marca se queda: se prefiere perder un recordatorio a mandar dos. El fallo queda en `eventos` y en mensajes.estado_entrega.';


-- -----------------------------------------------------------------------------
-- Politicas
-- -----------------------------------------------------------------------------
-- El bot INSERTA (es quien coge la marca) y LEE (para saber a quien le falta).
-- La clinica LEE, para que el panel pueda ensenarlo el dia que se le pida.
--
-- NADIE tiene UPDATE ni DELETE, ni el bot ni la clinica: la 004 se los revoca
-- al rol `authenticated` sobre todo `public` y aqui no se vuelven a conceder.
-- La marca solo puede crecer, igual que `auditoria`. Un recordatorio que se
-- puede desmarcar es un recordatorio que se puede mandar dos veces.
-- -----------------------------------------------------------------------------
drop policy if exists recordatorios_bot_insert on public.recordatorios;
create policy recordatorios_bot_insert on public.recordatorios
  for insert to authenticated
  with check (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists recordatorios_bot_select on public.recordatorios;
create policy recordatorios_bot_select on public.recordatorios
  for select to authenticated
  using (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists recordatorios_clinica_select on public.recordatorios;
create policy recordatorios_clinica_select on public.recordatorios
  for select to authenticated
  using (
        (select autorizacion.es_clinica())
    and clinica_id = (select autorizacion.clinica_id())
  );


-- =============================================================================
-- 3 · liberar_provisionales  —  el hueco vuelve a estar libre
-- =============================================================================
-- Una reserva provisional bloquea el sillon diez minutos mientras el paciente
-- confirma. Si no confirma, `expira_en` queda atras y la cita se queda ahi:
-- `consultar_huecos` la sigue contando como ocupada, porque excluye por
-- `estado` y no mira `expira_en`. Sin este trabajo, cada conversacion
-- abandonada le quita un hueco de verdad a la agenda, para siempre.
--
-- A `cancelada` y no a un borrado: la 003 dice que los estados que LIBERAN el
-- sillon son `cancelada` y `no_presentada`. Se elige `cancelada` porque
-- `no_presentada` significa que el paciente no vino a una cita que tenia, y
-- aqui nunca llego a tenerla. Y no se borra la fila para que quede rastro de
-- que hubo una retencion: recepcion puede querer saber cuantas se abandonan.
--
-- SECURITY INVOKER, no DEFINER. `pg_cron` ejecuta cada job con la identidad del
-- rol que lo programo —aqui `postgres`, que ya tiene BYPASSRLS—, asi que no
-- necesita que nadie le eleve privilegios. El proyecto sigue sin una sola
-- funcion SECURITY DEFINER, que es lo que pide .claude/CLAUDE.md.
--
-- Por lotes, por el mismo motivo que `purgar_historial`: una sentencia unica
-- sobre una agenda grande sostiene un lock mientras los webhooks esperan.
-- =============================================================================
create or replace function mantenimiento.liberar_provisionales(
  p_lote integer default 5000
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $func$
declare
  v_liberadas bigint := 0;
  v_n         bigint;
begin
  -- Cinturon: si un lote se atasca, muere el job, no la base de datos.
  perform set_config('statement_timeout', '60s', true);

  loop
    update public.citas
    set estado = 'cancelada',
        actualizada_en = now()
    where id in (
      select id
      from public.citas
      where estado = 'provisional'
        and expira_en is not null
        and expira_en < now()
      limit p_lote
    );
    get diagnostics v_n = row_count;
    v_liberadas := v_liberadas + v_n;
    exit when v_n = 0;
  end loop;

  return v_liberadas;
end;
$func$;

comment on function mantenimiento.liberar_provisionales(integer) is
  'Pasa a cancelada toda cita provisional cuyo expira_en ya paso, en lotes de p_lote filas, y devuelve cuantas. Con eso el hueco vuelve a ofrecerse: consultar_huecos excluye provisional/confirmada/completada y cancelada no esta en la lista. SECURITY INVOKER: lo ejecuta pg_cron como postgres, que ya tiene BYPASSRLS. El rol `bot` no puede hacer esto (42501) y es correcto que no pueda.';

-- Ni la API ni ningun usuario la ejecutan. Solo el rol del cron.
revoke all on function mantenimiento.liberar_provisionales(integer)
  from public, anon, authenticated;
grant execute on function mantenimiento.liberar_provisionales(integer) to postgres;


-- -----------------------------------------------------------------------------
-- El job
-- -----------------------------------------------------------------------------
-- Cada cinco minutos. La retencion dura diez, asi que una provisional
-- abandonada se libera como muy tarde quince minutos despues de nacer. Cada
-- hora seria mas barato y dejaria el sillon bloqueado casi una hora a alguien
-- que lo esta pidiendo ahora mismo por WhatsApp, que es justo el caso que esto
-- viene a arreglar.
-- -----------------------------------------------------------------------------
do $do$
begin
  if exists (select 1 from cron.job where jobname = 'liberar-provisionales-caducadas') then
    perform cron.unschedule('liberar-provisionales-caducadas');
  end if;

  perform cron.schedule(
    'liberar-provisionales-caducadas',
    '*/5 * * * *',
    $cmd$ select mantenimiento.liberar_provisionales(5000) $cmd$
  );
end $do$;
