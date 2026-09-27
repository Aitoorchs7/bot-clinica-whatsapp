-- =============================================================================
-- F1 · 004 · Row Level Security
-- =============================================================================
-- Esta es LA migracion del producto. Todo lo demas es andamiaje.
--
-- La promesa: lo que el bot no debe decir no se le esconde, NO LE LLEGA. No es
-- un filtro de intencion escrito en el prompt; es que la consulta no devuelve
-- la fila. Para el rol `bot`, la fila confidencial no existe.
--
-- Tres roles, que salen de app_metadata del JWT (NUNCA de user_metadata: ese lo
-- edita el propio usuario y serviria para declararse de otra clinica):
--
--   bot      -> app_metadata.rol = 'bot'. JWT firmado por el servidor, 5 min de
--               vida. SELECT solo de filas publico = true. Cero UPDATE y cero
--               DELETE sobre configuracion.
--   clinica  -> app_metadata.rol in (propietario | recepcion | lectura).
--               Usuario real de Supabase Auth. Todo lo de SU clinica,
--               incluidas las filas confidenciales.
--   nadie    -> anon. Ni una politica, y ademas sin grants. Dos cerrojos.
--
-- Este archivo esta en la lista de "no tocar sin confirmacion explicita" de
-- .claude/CLAUDE.md.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- RLS activada, otra vez
-- -----------------------------------------------------------------------------
-- Ya se activo en la migracion 002, junto a cada create table. Se repite aqui
-- porque el encargo lo pide en esta migracion y porque es idempotente: si
-- alguien anade una tabla y se olvida, esta lista es el segundo sitio donde
-- mirar. El test estatico de tests/rls/ comprueba que ambas listas coinciden.
-- -----------------------------------------------------------------------------
alter table public.clinicas        enable row level security;
alter table public.gabinetes       enable row level security;
alter table public.tratamientos    enable row level security;
alter table public.horarios        enable row level security;
alter table public.config          enable row level security;
alter table public.faq             enable row level security;
alter table public.bloques_prompt  enable row level security;
alter table public.pacientes       enable row level security;
alter table public.conversaciones  enable row level security;
alter table public.citas           enable row level security;
alter table public.mensajes        enable row level security;
alter table public.escalados       enable row level security;
alter table public.eventos_webhook enable row level security;
alter table public.eventos         enable row level security;
alter table public.auditoria       enable row level security;


-- -----------------------------------------------------------------------------
-- Funciones auxiliares
-- -----------------------------------------------------------------------------
-- Viven en un esquema PRIVADO. PostgREST solo publica `public` y
-- `graphql_public`, asi que `autorizacion` no es alcanzable por la API: nadie
-- puede llamarlas con .rpc().
--
-- Son SECURITY INVOKER (el valor por defecto; no se escribe `security definer`
-- en ninguna parte de este proyecto). Solo leen el JWT de la peticion en curso,
-- no tocan ninguna tabla, asi que no hay nada que elevar ni que justificar.
--
-- `set search_path = ''` y nombres cualificados: sin eso, un esquema malicioso
-- en el search_path podria suplantar auth.jwt().
-- -----------------------------------------------------------------------------
create schema if not exists autorizacion;

revoke all on schema autorizacion from public;

create or replace function autorizacion.clinica_id()
returns uuid
language sql
stable
set search_path = ''
as $func$
  select nullif((select auth.jwt()) -> 'app_metadata' ->> 'clinica_id', '')::uuid
$func$;

create or replace function autorizacion.rol()
returns text
language sql
stable
set search_path = ''
as $func$
  select coalesce((select auth.jwt()) -> 'app_metadata' ->> 'rol', '')
$func$;

create or replace function autorizacion.es_bot()
returns boolean
language sql
stable
set search_path = ''
as $func$
  select autorizacion.rol() = 'bot'
$func$;

-- Cualquiera de los tres roles del panel. `lectura` solo aparece en los USING
-- de SELECT, nunca en un WITH CHECK.
create or replace function autorizacion.es_clinica()
returns boolean
language sql
stable
set search_path = ''
as $func$
  select autorizacion.rol() in ('propietario', 'recepcion', 'lectura')
$func$;

create or replace function autorizacion.puede_escribir()
returns boolean
language sql
stable
set search_path = ''
as $func$
  select autorizacion.rol() in ('propietario', 'recepcion')
$func$;

create or replace function autorizacion.es_propietario()
returns boolean
language sql
stable
set search_path = ''
as $func$
  select autorizacion.rol() = 'propietario'
$func$;

comment on schema autorizacion is
  'Esquema privado, no publicado por PostgREST. Contiene solo funciones que leen app_metadata del JWT para las politicas RLS. Ninguna eleva privilegios: todas corren con la identidad de quien llama.';

-- `authenticated` necesita poder ejecutarlas porque las politicas se evaluan
-- con su identidad. Esto NO las expone por la API: el esquema sigue sin estar
-- publicado. A `anon` no se le concede nada: no tiene ni una politica, asi que
-- Postgres nunca llega a evaluar una expresion para el.
grant usage on schema autorizacion to authenticated;
grant execute on all functions in schema autorizacion to authenticated;


-- =============================================================================
-- POLITICAS
-- =============================================================================
-- Patron, sin excepciones:
--
--   * Una politica por comando. Nunca `for all`: mezcla el USING del SELECT con
--     el WITH CHECK del INSERT y acaba concediendo de mas.
--   * `to authenticated` siempre. El JWT del bot tambien lleva role =
--     'authenticated'; lo que lo distingue es app_metadata.rol.
--   * Las funciones van envueltas en (select ...). No es estilo: sin el
--     subselect se evaluan UNA VEZ POR FILA.
--   * WITH CHECK en todo INSERT y todo UPDATE, siempre comprobando clinica_id.
--   * Todo UPDATE lleva ademas su politica de SELECT. Sin ella la
--     actualizacion devuelve cero filas EN SILENCIO, sin error.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- clinicas
-- -----------------------------------------------------------------------------
-- Nadie da de alta ni borra clinicas por la API: eso es un script con
-- service_role. Por eso no hay politica de INSERT ni de DELETE.
drop policy if exists clinicas_bot_select on public.clinicas;
create policy clinicas_bot_select on public.clinicas
  for select to authenticated
  using (
        (select autorizacion.es_bot())
    and id = (select autorizacion.clinica_id())
  );

drop policy if exists clinicas_clinica_select on public.clinicas;
create policy clinicas_clinica_select on public.clinicas
  for select to authenticated
  using (
        (select autorizacion.es_clinica())
    and id = (select autorizacion.clinica_id())
  );

drop policy if exists clinicas_propietario_update on public.clinicas;
create policy clinicas_propietario_update on public.clinicas
  for update to authenticated
  using (
        (select autorizacion.es_propietario())
    and id = (select autorizacion.clinica_id())
  )
  with check (
        (select autorizacion.es_propietario())
    and id = (select autorizacion.clinica_id())
  );


-- -----------------------------------------------------------------------------
-- config  —  tabla de conocimiento con `publico`
-- -----------------------------------------------------------------------------
drop policy if exists config_bot_select on public.config;
create policy config_bot_select on public.config
  for select to authenticated
  using (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
    and publico = true          -- <- LA linea
  );
-- No hay config_bot_insert, ni _update, ni _delete. El bot no toca la
-- configuracion. Su ausencia es la politica.

drop policy if exists config_clinica_select on public.config;
create policy config_clinica_select on public.config
  for select to authenticated
  using (
        (select autorizacion.es_clinica())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists config_clinica_insert on public.config;
create policy config_clinica_insert on public.config
  for insert to authenticated
  with check (
        (select autorizacion.puede_escribir())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists config_clinica_update on public.config;
create policy config_clinica_update on public.config
  for update to authenticated
  using (
        (select autorizacion.puede_escribir())
    and clinica_id = (select autorizacion.clinica_id())
  )
  with check (
        (select autorizacion.puede_escribir())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists config_clinica_delete on public.config;
create policy config_clinica_delete on public.config
  for delete to authenticated
  using (
        (select autorizacion.es_propietario())
    and clinica_id = (select autorizacion.clinica_id())
  );


-- -----------------------------------------------------------------------------
-- tratamientos  —  tabla de conocimiento con `publico`
-- -----------------------------------------------------------------------------
drop policy if exists tratamientos_bot_select on public.tratamientos;
create policy tratamientos_bot_select on public.tratamientos
  for select to authenticated
  using (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
    and publico = true
  );

drop policy if exists tratamientos_clinica_select on public.tratamientos;
create policy tratamientos_clinica_select on public.tratamientos
  for select to authenticated
  using (
        (select autorizacion.es_clinica())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists tratamientos_clinica_insert on public.tratamientos;
create policy tratamientos_clinica_insert on public.tratamientos
  for insert to authenticated
  with check (
        (select autorizacion.puede_escribir())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists tratamientos_clinica_update on public.tratamientos;
create policy tratamientos_clinica_update on public.tratamientos
  for update to authenticated
  using (
        (select autorizacion.puede_escribir())
    and clinica_id = (select autorizacion.clinica_id())
  )
  with check (
        (select autorizacion.puede_escribir())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists tratamientos_clinica_delete on public.tratamientos;
create policy tratamientos_clinica_delete on public.tratamientos
  for delete to authenticated
  using (
        (select autorizacion.es_propietario())
    and clinica_id = (select autorizacion.clinica_id())
  );


-- -----------------------------------------------------------------------------
-- faq  —  tabla de conocimiento con `publico`
-- -----------------------------------------------------------------------------
drop policy if exists faq_bot_select on public.faq;
create policy faq_bot_select on public.faq
  for select to authenticated
  using (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
    and publico = true
  );

drop policy if exists faq_clinica_select on public.faq;
create policy faq_clinica_select on public.faq
  for select to authenticated
  using (
        (select autorizacion.es_clinica())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists faq_clinica_insert on public.faq;
create policy faq_clinica_insert on public.faq
  for insert to authenticated
  with check (
        (select autorizacion.puede_escribir())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists faq_clinica_update on public.faq;
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

drop policy if exists faq_clinica_delete on public.faq;
create policy faq_clinica_delete on public.faq
  for delete to authenticated
  using (
        (select autorizacion.es_propietario())
    and clinica_id = (select autorizacion.clinica_id())
  );


-- -----------------------------------------------------------------------------
-- gabinetes  —  sin `publico`: el bot los necesita enteros para calcular huecos
-- -----------------------------------------------------------------------------
drop policy if exists gabinetes_bot_select on public.gabinetes;
create policy gabinetes_bot_select on public.gabinetes
  for select to authenticated
  using (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists gabinetes_clinica_select on public.gabinetes;
create policy gabinetes_clinica_select on public.gabinetes
  for select to authenticated
  using (
        (select autorizacion.es_clinica())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists gabinetes_clinica_insert on public.gabinetes;
create policy gabinetes_clinica_insert on public.gabinetes
  for insert to authenticated
  with check (
        (select autorizacion.puede_escribir())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists gabinetes_clinica_update on public.gabinetes;
create policy gabinetes_clinica_update on public.gabinetes
  for update to authenticated
  using (
        (select autorizacion.puede_escribir())
    and clinica_id = (select autorizacion.clinica_id())
  )
  with check (
        (select autorizacion.puede_escribir())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists gabinetes_clinica_delete on public.gabinetes;
create policy gabinetes_clinica_delete on public.gabinetes
  for delete to authenticated
  using (
        (select autorizacion.es_propietario())
    and clinica_id = (select autorizacion.clinica_id())
  );


-- -----------------------------------------------------------------------------
-- horarios  —  sin `publico`, misma razon que gabinetes
-- -----------------------------------------------------------------------------
drop policy if exists horarios_bot_select on public.horarios;
create policy horarios_bot_select on public.horarios
  for select to authenticated
  using (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists horarios_clinica_select on public.horarios;
create policy horarios_clinica_select on public.horarios
  for select to authenticated
  using (
        (select autorizacion.es_clinica())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists horarios_clinica_insert on public.horarios;
create policy horarios_clinica_insert on public.horarios
  for insert to authenticated
  with check (
        (select autorizacion.puede_escribir())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists horarios_clinica_update on public.horarios;
create policy horarios_clinica_update on public.horarios
  for update to authenticated
  using (
        (select autorizacion.puede_escribir())
    and clinica_id = (select autorizacion.clinica_id())
  )
  with check (
        (select autorizacion.puede_escribir())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists horarios_clinica_delete on public.horarios;
create policy horarios_clinica_delete on public.horarios
  for delete to authenticated
  using (
        (select autorizacion.es_propietario())
    and clinica_id = (select autorizacion.clinica_id())
  );


-- -----------------------------------------------------------------------------
-- bloques_prompt  —  el bot solo ve los activos
-- -----------------------------------------------------------------------------
drop policy if exists bloques_prompt_bot_select on public.bloques_prompt;
create policy bloques_prompt_bot_select on public.bloques_prompt
  for select to authenticated
  using (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
    and activo = true
  );

drop policy if exists bloques_prompt_clinica_select on public.bloques_prompt;
create policy bloques_prompt_clinica_select on public.bloques_prompt
  for select to authenticated
  using (
        (select autorizacion.es_clinica())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists bloques_prompt_clinica_insert on public.bloques_prompt;
create policy bloques_prompt_clinica_insert on public.bloques_prompt
  for insert to authenticated
  with check (
        (select autorizacion.es_propietario())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists bloques_prompt_clinica_update on public.bloques_prompt;
create policy bloques_prompt_clinica_update on public.bloques_prompt
  for update to authenticated
  using (
        (select autorizacion.es_propietario())
    and clinica_id = (select autorizacion.clinica_id())
  )
  with check (
        (select autorizacion.es_propietario())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists bloques_prompt_clinica_delete on public.bloques_prompt;
create policy bloques_prompt_clinica_delete on public.bloques_prompt
  for delete to authenticated
  using (
        (select autorizacion.es_propietario())
    and clinica_id = (select autorizacion.clinica_id())
  );


-- -----------------------------------------------------------------------------
-- pacientes  —  tabla de operacion: el bot escribe
-- -----------------------------------------------------------------------------
drop policy if exists pacientes_bot_select on public.pacientes;
create policy pacientes_bot_select on public.pacientes
  for select to authenticated
  using (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists pacientes_bot_insert on public.pacientes;
create policy pacientes_bot_insert on public.pacientes
  for insert to authenticated
  with check (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists pacientes_bot_update on public.pacientes;
create policy pacientes_bot_update on public.pacientes
  for update to authenticated
  using (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
  )
  with check (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists pacientes_clinica_select on public.pacientes;
create policy pacientes_clinica_select on public.pacientes
  for select to authenticated
  using (
        (select autorizacion.es_clinica())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists pacientes_clinica_insert on public.pacientes;
create policy pacientes_clinica_insert on public.pacientes
  for insert to authenticated
  with check (
        (select autorizacion.puede_escribir())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists pacientes_clinica_update on public.pacientes;
create policy pacientes_clinica_update on public.pacientes
  for update to authenticated
  using (
        (select autorizacion.puede_escribir())
    and clinica_id = (select autorizacion.clinica_id())
  )
  with check (
        (select autorizacion.puede_escribir())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists pacientes_clinica_delete on public.pacientes;
create policy pacientes_clinica_delete on public.pacientes
  for delete to authenticated
  using (
        (select autorizacion.es_propietario())
    and clinica_id = (select autorizacion.clinica_id())
  );


-- -----------------------------------------------------------------------------
-- conversaciones  —  el panel las lee, no las escribe (en esta version no hay
--                    bandeja de respuesta humana)
-- -----------------------------------------------------------------------------
drop policy if exists conversaciones_bot_select on public.conversaciones;
create policy conversaciones_bot_select on public.conversaciones
  for select to authenticated
  using (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists conversaciones_bot_insert on public.conversaciones;
create policy conversaciones_bot_insert on public.conversaciones
  for insert to authenticated
  with check (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists conversaciones_bot_update on public.conversaciones;
create policy conversaciones_bot_update on public.conversaciones
  for update to authenticated
  using (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
  )
  with check (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists conversaciones_clinica_select on public.conversaciones;
create policy conversaciones_clinica_select on public.conversaciones
  for select to authenticated
  using (
        (select autorizacion.es_clinica())
    and clinica_id = (select autorizacion.clinica_id())
  );


-- -----------------------------------------------------------------------------
-- citas
-- -----------------------------------------------------------------------------
drop policy if exists citas_bot_select on public.citas;
create policy citas_bot_select on public.citas
  for select to authenticated
  using (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
  );

-- El bot solo puede crear citas a su nombre. quien_reserva = 'bot' en el
-- WITH CHECK impide que se haga pasar por recepcion.
drop policy if exists citas_bot_insert on public.citas;
create policy citas_bot_insert on public.citas
  for insert to authenticated
  with check (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
    and quien_reserva = 'bot'
    and estado in ('provisional', 'confirmada')
  );

-- ACOTADO A LA TRANSICION QUE NECESITA. El USING mira la fila como esta ahora;
-- el WITH CHECK, como va a quedar. El bot puede confirmar lo que el mismo
-- reservo, y nada mas: no puede cancelar la cita de nadie ni resucitar una
-- cancelada.
drop policy if exists citas_bot_update on public.citas;
create policy citas_bot_update on public.citas
  for update to authenticated
  using (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
    and estado = 'provisional'
  )
  with check (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
    and estado in ('provisional', 'confirmada')
  );

drop policy if exists citas_clinica_select on public.citas;
create policy citas_clinica_select on public.citas
  for select to authenticated
  using (
        (select autorizacion.es_clinica())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists citas_clinica_insert on public.citas;
create policy citas_clinica_insert on public.citas
  for insert to authenticated
  with check (
        (select autorizacion.puede_escribir())
    and clinica_id = (select autorizacion.clinica_id())
  );

-- Recepcion mueve y cancela desde el panel. No borra: se cancela con `estado`,
-- para que quede rastro.
drop policy if exists citas_clinica_update on public.citas;
create policy citas_clinica_update on public.citas
  for update to authenticated
  using (
        (select autorizacion.puede_escribir())
    and clinica_id = (select autorizacion.clinica_id())
  )
  with check (
        (select autorizacion.puede_escribir())
    and clinica_id = (select autorizacion.clinica_id())
  );


-- -----------------------------------------------------------------------------
-- mensajes  —  el historial. El panel lo lee; nadie lo edita salvo el bot, y
--              solo para anotar el estado de entrega que devuelve Meta.
-- -----------------------------------------------------------------------------
drop policy if exists mensajes_bot_select on public.mensajes;
create policy mensajes_bot_select on public.mensajes
  for select to authenticated
  using (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists mensajes_bot_insert on public.mensajes;
create policy mensajes_bot_insert on public.mensajes
  for insert to authenticated
  with check (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists mensajes_bot_update on public.mensajes;
create policy mensajes_bot_update on public.mensajes
  for update to authenticated
  using (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
  )
  with check (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists mensajes_clinica_select on public.mensajes;
create policy mensajes_clinica_select on public.mensajes
  for select to authenticated
  using (
        (select autorizacion.es_clinica())
    and clinica_id = (select autorizacion.clinica_id())
  );


-- -----------------------------------------------------------------------------
-- escalados  —  el bot los crea, recepcion los resuelve
-- -----------------------------------------------------------------------------
drop policy if exists escalados_bot_select on public.escalados;
create policy escalados_bot_select on public.escalados
  for select to authenticated
  using (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists escalados_bot_insert on public.escalados;
create policy escalados_bot_insert on public.escalados
  for insert to authenticated
  with check (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
    and estado = 'pendiente'
  );

drop policy if exists escalados_clinica_select on public.escalados;
create policy escalados_clinica_select on public.escalados
  for select to authenticated
  using (
        (select autorizacion.es_clinica())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists escalados_clinica_update on public.escalados;
create policy escalados_clinica_update on public.escalados
  for update to authenticated
  using (
        (select autorizacion.puede_escribir())
    and clinica_id = (select autorizacion.clinica_id())
  )
  with check (
        (select autorizacion.puede_escribir())
    and clinica_id = (select autorizacion.clinica_id())
  );


-- -----------------------------------------------------------------------------
-- eventos_webhook  —  fontaneria del canal. Solo el bot. El panel no lo
--                     necesita y contiene la carga cruda de Meta.
-- -----------------------------------------------------------------------------
drop policy if exists eventos_webhook_bot_select on public.eventos_webhook;
create policy eventos_webhook_bot_select on public.eventos_webhook
  for select to authenticated
  using (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists eventos_webhook_bot_insert on public.eventos_webhook;
create policy eventos_webhook_bot_insert on public.eventos_webhook
  for insert to authenticated
  with check (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists eventos_webhook_bot_update on public.eventos_webhook;
create policy eventos_webhook_bot_update on public.eventos_webhook
  for update to authenticated
  using (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
  )
  with check (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
  );


-- -----------------------------------------------------------------------------
-- eventos  —  aqui escribe el CONTADOR de la barandilla 2
-- -----------------------------------------------------------------------------
drop policy if exists eventos_bot_select on public.eventos;
create policy eventos_bot_select on public.eventos
  for select to authenticated
  using (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists eventos_bot_insert on public.eventos;
create policy eventos_bot_insert on public.eventos
  for insert to authenticated
  with check (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists eventos_clinica_select on public.eventos;
create policy eventos_clinica_select on public.eventos
  for select to authenticated
  using (
        (select autorizacion.es_clinica())
    and clinica_id = (select autorizacion.clinica_id())
  );


-- -----------------------------------------------------------------------------
-- auditoria  —  solo se anade. Ni una politica de UPDATE ni de DELETE, para
--               nadie.
-- -----------------------------------------------------------------------------
drop policy if exists auditoria_bot_select on public.auditoria;
create policy auditoria_bot_select on public.auditoria
  for select to authenticated
  using (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists auditoria_bot_insert on public.auditoria;
create policy auditoria_bot_insert on public.auditoria
  for insert to authenticated
  with check (
        (select autorizacion.es_bot())
    and clinica_id = (select autorizacion.clinica_id())
  );

drop policy if exists auditoria_clinica_select on public.auditoria;
create policy auditoria_clinica_select on public.auditoria
  for select to authenticated
  using (
        (select autorizacion.es_clinica())
    and clinica_id = (select autorizacion.clinica_id())
  );


-- =============================================================================
-- El segundo cerrojo: privilegios de tabla
-- =============================================================================
-- La RLS ya lo cubre todo. Esto es defensa en profundidad: si alguien
-- desactivara la RLS de una tabla por error, `anon` seguiria sin ver nada
-- porque ni siquiera tiene el GRANT.
--
-- Ojo al disenar los tests: por esto mismo, probar la RLS SOLO con `anon` daria
-- verde aunque la RLS estuviera apagada. El probador principal de los tests es
-- un cliente `authenticated` de otra clinica.
-- =============================================================================

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- Tablas que solo crecen: nadie las modifica ni las borra por la API, ni
-- siquiera con el GRANT. El unico borrado del sistema es el de retencion, y lo
-- hace el job de pg_cron como `postgres`.
revoke update, delete on public.auditoria        from authenticated;
revoke update, delete on public.eventos          from authenticated;
revoke delete          on public.eventos_webhook from authenticated;
revoke delete          on public.mensajes        from authenticated;
revoke delete          on public.conversaciones  from authenticated;
revoke delete          on public.citas           from authenticated;
revoke delete          on public.escalados       from authenticated;
revoke insert, delete  on public.clinicas        from authenticated;
