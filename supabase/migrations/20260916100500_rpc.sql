-- =============================================================================
-- F1 · 005 · Funciones RPC
-- =============================================================================
-- Las dos herramientas del bot que hablan con la agenda. Viven en `public`
-- porque tienen que ser llamables con .rpc() desde supabase-js.
--
-- AMBAS SON SECURITY INVOKER. Es lo que impide usarlas para saltarse la RLS:
-- cada select y cada insert de dentro se evalua con la identidad de quien
-- llama, asi que pasan por sus politicas. Una funcion SECURITY DEFINER aqui
-- seria una puerta trasera al esquema entero. No hay ninguna en este proyecto.
--
-- `set search_path = ''` en las dos, con todos los nombres cualificados: sin
-- eso, un esquema colado en el search_path podria suplantar `public.citas`.
--
-- LA LECCION DE V1 QUE HAY QUE PRESERVAR
-- --------------------------------------
-- V1 tenia dos funciones separadas, huecos() y hueco_libre(), y fusionarlas fue
-- un bug real que mentia al paciente: la rejilla de 15 minutos con la que se
-- OFRECEN huecos se uso como si fuera una restriccion de RESERVA, y pedir "las
-- cinco y veinte" con la agenda vacia se rechazaba con un "ese hueco ya no esta
-- libre, se lo acaban de coger".
--
-- Aqui la separacion se mantiene:
--   consultar_huecos -> produce la rejilla que se OFRECE. Es una muestra.
--   crear_cita       -> acepta CUALQUIER hora exacta y deja que decida la base
--                       de datos. Si el paciente pide una hora que no estaba en
--                       la lista, no se le dice que esta ocupada: se intenta.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Tipos de retorno
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type
                 where typname = 'hueco'
                   and typnamespace = 'public'::regnamespace) then
    create type public.hueco as (
      inicio      timestamptz,
      fin         timestamptz,
      gabinete_id uuid
    );
  end if;

  if not exists (select 1 from pg_type
                 where typname = 'resultado_cita'
                   and typnamespace = 'public'::regnamespace) then
    create type public.resultado_cita as (
      ok      boolean,
      motivo  text,
      cita_id uuid,
      inicio  timestamptz,
      fin     timestamptz
    );
  end if;
end $$;


-- =============================================================================
-- consultar_huecos
-- =============================================================================
-- Devuelve las ranuras REALMENTE libres entre dos fechas, para un tratamiento.
-- El bot nunca inventa un hueco: solo dice lo que sale de aqui.
--
-- No hace falta comprobar que p_clinica coincide con la del JWT: al ser
-- SECURITY INVOKER, la lectura de public.clinicas ya pasa por la RLS, asi que
-- pedir la agenda de otra clinica devuelve cero filas por construccion.
--
-- El muestreo (ofrecer dos opciones, una por la manana y otra por la tarde, en
-- vez de las cuarenta que caben) NO se hace aqui: es decision de conversacion y
-- vive en la capa de herramientas de F3. Esta funcion devuelve la verdad
-- completa, ordenada.
-- =============================================================================
create or replace function public.consultar_huecos(
  p_clinica     uuid,
  p_tratamiento uuid,
  p_desde       timestamptz,
  p_hasta       timestamptz,
  p_limite      integer default 200
)
returns setof public.hueco
language sql
stable
security invoker
set search_path = ''
as $func$
  with clinica as (
    select c.id, c.zona_horaria, c.paso_minutos, c.dias_maximos_antelacion
    from public.clinicas c
    where c.id = p_clinica
      and c.activa
  ),
  trat as (
    select t.id, t.duracion_min, t.gabinete_id
    from public.tratamientos t
    join clinica c on c.id = t.clinica_id
    where t.id = p_tratamiento
      and t.activo
  ),
  -- Nunca antes de ahora, nunca mas alla del limite de antelacion de la clinica
  -- (120 dias por defecto, heredado de V1).
  ventana as (
    select
      greatest(p_desde, now())                                                    as desde,
      least(p_hasta, now() + make_interval(days => c.dias_maximos_antelacion))    as hasta,
      c.zona_horaria,
      c.paso_minutos
    from clinica c
  ),
  dias as (
    select
      d::date        as dia,
      v.zona_horaria,
      v.paso_minutos,
      v.desde,
      v.hasta
    from ventana v
    cross join generate_series(
      (v.desde at time zone v.zona_horaria)::date,
      (v.hasta at time zone v.zona_horaria)::date,
      interval '1 day'
    ) as d
    where v.hasta > v.desde
  ),
  -- Los horarios se guardan en hora LOCAL de la clinica. Aqui es donde se
  -- convierten a timestamptz con su zona: si no, una clinica en Canarias
  -- abriria una hora antes de lo que cree.
  tramos as (
    select
      ((d.dia + h.hora_inicio) at time zone d.zona_horaria) as tramo_inicio,
      ((d.dia + h.hora_fin)    at time zone d.zona_horaria) as tramo_fin,
      d.paso_minutos,
      d.desde,
      d.hasta
    from dias d
    join public.horarios h
      on h.clinica_id = p_clinica
     and h.dia_semana = extract(dow from d.dia)::smallint
  ),
  -- Rejilla de inicio cada `paso_minutos`, exigiendo que la cita entera quepa
  -- dentro del tramo: no se parte el descanso del mediodia.
  ranuras as (
    select
      s                                             as inicio,
      s + make_interval(mins => t.duracion_min)     as fin,
      tr.desde,
      tr.hasta
    from tramos tr
    cross join trat t
    cross join generate_series(
      tr.tramo_inicio,
      tr.tramo_fin - make_interval(mins => t.duracion_min),
      make_interval(mins => tr.paso_minutos)
    ) as s
  ),
  -- gabinete_id nulo en el tratamiento = "cualquiera", igual que en V1.
  gabinetes_validos as (
    select g.id
    from public.gabinetes g
    cross join trat t
    where g.clinica_id = p_clinica
      and g.activo
      and (t.gabinete_id is null or g.id = t.gabinete_id)
  )
  select r.inicio, r.fin, g.id
  from ranuras r
  cross join gabinetes_validos g
  where r.inicio >= r.desde
    and r.inicio <= r.hasta
    and not exists (
      select 1
      from public.citas c
      where c.gabinete_id = g.id
        and c.estado in ('provisional', 'confirmada', 'completada')
        and tstzrange(c.inicio, c.fin, '[)') && tstzrange(r.inicio, r.fin, '[)')
    )
  order by r.inicio, g.id
  limit p_limite;
$func$;

comment on function public.consultar_huecos(uuid, uuid, timestamptz, timestamptz, integer) is
  'Ranuras libres para un tratamiento entre dos fechas. SECURITY INVOKER: la RLS del que llama decide que clinica y que citas se ven, asi que no puede usarse para mirar la agenda de otro inquilino. Devuelve la lista completa ordenada; el muestreo para ofrecer dos opciones se hace en la capa de herramientas.';


-- =============================================================================
-- crear_cita
-- =============================================================================
-- Acepta CUALQUIER hora exacta. Comprueba en orden: clinica, tratamiento,
-- pasado, antelacion maxima, horario, gabinete. Y para el solape no comprueba
-- nada: inserta y deja que hable el constraint `sin_solape`.
--
-- Esa es la diferencia entre una garantia y una buena intencion. Dos webhooks
-- simultaneos pidiendo el mismo sillon: uno entra, el otro recibe
-- {ok: false, motivo: 'ocupado'}. No hay ventana entre comprobar y escribir
-- porque no se comprueba.
-- =============================================================================
create or replace function public.crear_cita(
  p_clinica         uuid,
  p_paciente        uuid,
  p_tratamiento     uuid,
  p_inicio          timestamptz,
  p_motivo          public.motivo_visita default 'otro',
  p_conversacion    uuid    default null,
  p_gabinete        uuid    default null,
  p_provisional     boolean default true,
  p_minutos_reserva integer default 10
)
returns public.resultado_cita
language plpgsql
security invoker
set search_path = ''
as $func$
declare
  v_clinica    public.clinicas%rowtype;
  v_trat       public.tratamientos%rowtype;
  v_fin        timestamptz;
  v_inicio_loc timestamp;
  v_fin_loc    timestamp;
  v_gab        uuid;
  v_id         uuid;
  v_res        public.resultado_cita;
begin
  v_res := row(false, 'desconocido', null::uuid, null::timestamptz, null::timestamptz)
           ::public.resultado_cita;

  -- La RLS ya filtra por clinica: si el JWT es de otra, esto no encuentra nada.
  select * into v_clinica
  from public.clinicas
  where id = p_clinica and activa;
  if not found then
    v_res.motivo := 'clinica_no_coincide';
    return v_res;
  end if;

  select * into v_trat
  from public.tratamientos
  where id = p_tratamiento and clinica_id = p_clinica and activo;
  if not found then
    v_res.motivo := 'tratamiento_desconocido';
    return v_res;
  end if;

  v_fin        := p_inicio + make_interval(mins => v_trat.duracion_min);
  v_inicio_loc := p_inicio at time zone v_clinica.zona_horaria;
  v_fin_loc    := v_fin    at time zone v_clinica.zona_horaria;

  if p_inicio <= now() then
    v_res.motivo := 'pasado';
    return v_res;
  end if;

  if p_inicio > now() + make_interval(days => v_clinica.dias_maximos_antelacion) then
    v_res.motivo := 'demasiado_lejos';
    return v_res;
  end if;

  -- La cita entera tiene que caber dentro de UN tramo, el mismo dia. Si no
  -- cabe, el motivo es 'fuera_de_horario' y NO 'ocupado': decirle a alguien que
  -- su hora esta cogida cuando en realidad la clinica esta cerrada es
  -- exactamente el fallo que V1 documenta.
  if not exists (
    select 1
    from public.horarios h
    where h.clinica_id = p_clinica
      and h.dia_semana  = extract(dow from v_inicio_loc)::smallint
      and v_inicio_loc::time >= h.hora_inicio
      and v_fin_loc::time    <= h.hora_fin
      and v_inicio_loc::date  = v_fin_loc::date
  ) then
    v_res.motivo := 'fuera_de_horario';
    return v_res;
  end if;

  -- Gabinete: el que pidan, el del tratamiento, o el primero libre.
  v_gab := coalesce(p_gabinete, v_trat.gabinete_id);

  if v_gab is null then
    select g.id into v_gab
    from public.gabinetes g
    where g.clinica_id = p_clinica
      and g.activo
      and not exists (
        select 1
        from public.citas c
        where c.gabinete_id = g.id
          and c.estado in ('provisional', 'confirmada', 'completada')
          and tstzrange(c.inicio, c.fin, '[)') && tstzrange(p_inicio, v_fin, '[)')
      )
    order by g.nombre
    limit 1;
  end if;

  if v_gab is null then
    v_res.motivo := 'ocupado';
    return v_res;
  end if;

  begin
    insert into public.citas (
      clinica_id, paciente_id, tratamiento_id, gabinete_id,
      inicio, fin, estado, expira_en, quien_reserva, motivo_cerrado, conversacion_id
    )
    values (
      p_clinica, p_paciente, p_tratamiento, v_gab,
      p_inicio, v_fin,
      (case when p_provisional then 'provisional' else 'confirmada' end)::public.estado_cita,
      (case when p_provisional
            then now() + make_interval(mins => p_minutos_reserva)
            else null end),
      'bot', p_motivo, p_conversacion
    )
    returning id into v_id;
  exception
    -- 23P01. Es el constraint `sin_solape` haciendo su trabajo. El bot recibe
    -- un motivo limpio en vez de un 500.
    when exclusion_violation then
      v_res.motivo := 'ocupado';
      return v_res;
    when unique_violation then
      v_res.motivo := 'duplicada';
      return v_res;
    -- 42501. La politica citas_bot_insert ha dicho que no.
    when insufficient_privilege then
      v_res.motivo := 'sin_permiso';
      return v_res;
    when foreign_key_violation then
      v_res.motivo := 'paciente_desconocido';
      return v_res;
  end;

  v_res := row(true, 'creada', v_id, p_inicio, v_fin)::public.resultado_cita;
  return v_res;
end;
$func$;

comment on function public.crear_cita(uuid, uuid, uuid, timestamptz, public.motivo_visita, uuid, uuid, boolean, integer) is
  'Crea una cita en cualquier hora exacta. No comprueba el solape: inserta y captura exclusion_violation (23P01) del constraint sin_solape, de modo que no existe ventana entre comprobar y escribir. SECURITY INVOKER: el INSERT pasa por la politica citas_bot_insert. Motivos posibles: creada, clinica_no_coincide, tratamiento_desconocido, pasado, demasiado_lejos, fuera_de_horario, ocupado, duplicada, sin_permiso, paciente_desconocido.';


-- -----------------------------------------------------------------------------
-- Privilegios de ejecucion
-- -----------------------------------------------------------------------------
-- Postgres concede EXECUTE a PUBLIC por defecto en toda funcion nueva, y
-- revocarselo a `anon` no basta porque lo heredaria igual de PUBLIC. Se cierra
-- a mano: solo `authenticated` (que es el rol tanto del bot como del panel).
-- -----------------------------------------------------------------------------
revoke all on function public.consultar_huecos(uuid, uuid, timestamptz, timestamptz, integer)
  from public, anon;
revoke all on function public.crear_cita(uuid, uuid, uuid, timestamptz, public.motivo_visita, uuid, uuid, boolean, integer)
  from public, anon;

grant execute on function public.consultar_huecos(uuid, uuid, timestamptz, timestamptz, integer)
  to authenticated;
grant execute on function public.crear_cita(uuid, uuid, uuid, timestamptz, public.motivo_visita, uuid, uuid, boolean, integer)
  to authenticated;
