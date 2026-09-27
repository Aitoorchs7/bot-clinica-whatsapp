-- =============================================================================
-- F1 · 002 · Tablas
-- =============================================================================
-- Reglas que se aplican a TODO este archivo:
--
--   * Toda tabla salvo `clinicas` lleva
--         clinica_id uuid not null references public.clinicas(id) on delete cascade
--     con su indice. `clinicas` no lo lleva porque ES la raiz del inquilino:
--     su `id` es el clinica_id de todas las demas.
--
--   * Toda tabla activa RLS en esta misma migracion, junto al create table
--     (lo exige .claude/CLAUDE.md). Las politicas llegan en 004.
--     Activar RLS sin politicas = nadie ve nada. Es el estado seguro por
--     defecto mientras 004 no se aplique.
--
--   * timestamptz siempre, nunca timestamp. text, nunca varchar(n).
--     numeric para dinero, nunca float. Identificadores en minuscula.
--
--   * Claves primarias: uuid en las tablas de volumen bajo cuyo id viaja en
--     URLs, JWTs o argumentos de RPC; bigint identity en las cuatro tablas que
--     solo crecen y cuyo id no sale nunca al exterior (mensajes,
--     eventos_webhook, eventos, auditoria). Un uuid v4 como clave primaria
--     fragmenta el indice al insertar, y esas cuatro son justo las que mas
--     insertan.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Vocabulario cerrado
-- -----------------------------------------------------------------------------
-- Son enums, no texto libre. `motivo_visita` es el que mantiene el sistema
-- fuera del Art. 9 del RGPD: si un paciente cuenta por WhatsApp que toma
-- anticoagulantes, eso queda en `mensajes` (que se borra a los 90 dias) y no
-- pasa nunca a su ficha.
--
-- No son enums, y es deliberado, los vocabularios que define CADA CLINICA y que
-- por tanto van a crecer: `tratamientos.codigo` y `config.clave`. Son text.
-- Motivo: `alter type ... add value` no se puede usar en la misma transaccion
-- en que se emplea el valor nuevo, y eso convertiria cada alta de clinica en
-- una migracion.
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'motivo_visita' and typnamespace = 'public'::regnamespace) then
    create type public.motivo_visita as enum
      ('revision', 'urgencia', 'estetica', 'ortodoncia', 'otro');
  end if;

  if not exists (select 1 from pg_type where typname = 'estado_cita' and typnamespace = 'public'::regnamespace) then
    create type public.estado_cita as enum
      ('provisional', 'confirmada', 'cancelada', 'completada', 'no_presentada');
  end if;

  if not exists (select 1 from pg_type where typname = 'quien_reserva' and typnamespace = 'public'::regnamespace) then
    create type public.quien_reserva as enum
      ('bot', 'recepcion', 'paciente');
  end if;

  if not exists (select 1 from pg_type where typname = 'rol_mensaje' and typnamespace = 'public'::regnamespace) then
    create type public.rol_mensaje as enum
      ('paciente', 'bot', 'sistema');
  end if;

  if not exists (select 1 from pg_type where typname = 'estado_conversacion' and typnamespace = 'public'::regnamespace) then
    create type public.estado_conversacion as enum
      ('abierta', 'cerrada', 'escalada');
  end if;

  -- Los cinco motivos de escalado de V1, sin inventar ninguno.
  if not exists (select 1 from pg_type where typname = 'motivo_escalado' and typnamespace = 'public'::regnamespace) then
    create type public.motivo_escalado as enum
      ('pregunta_fuera_de_faq', 'pidio_persona', 'datos_incompletos',
       'urgencia_grave', 'no_entendido');
  end if;

  if not exists (select 1 from pg_type where typname = 'estado_escalado' and typnamespace = 'public'::regnamespace) then
    create type public.estado_escalado as enum
      ('pendiente', 'en_curso', 'resuelto');
  end if;

  if not exists (select 1 from pg_type where typname = 'estado_entrega' and typnamespace = 'public'::regnamespace) then
    create type public.estado_entrega as enum
      ('pendiente', 'enviado', 'entregado', 'leido', 'fallido');
  end if;

  if not exists (select 1 from pg_type where typname = 'origen_paciente' and typnamespace = 'public'::regnamespace) then
    create type public.origen_paciente as enum
      ('whatsapp', 'recepcion', 'importacion');
  end if;

  if not exists (select 1 from pg_type where typname = 'trato' and typnamespace = 'public'::regnamespace) then
    create type public.trato as enum ('usted', 'tu');
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- 1 · clinicas  —  la raiz del inquilino
-- -----------------------------------------------------------------------------
create table if not exists public.clinicas (
  id                       uuid        primary key default gen_random_uuid(),
  nombre                   text        not null,
  slug                     text        not null unique,
  wa_phone_number_id       text        unique,
  wa_waba_id               text,
  zona_horaria             text        not null default 'Europe/Madrid',
  trato                    public.trato not null default 'usted',
  nombre_bot               text        not null default 'Asistente',
  telefono_recepcion       text        not null,
  email_avisos             text        not null,
  -- Constantes de negocio heredadas de V1 (nucleo/registro.py):
  -- no se dan citas mas alla de 120 dias, y la rejilla de huecos es de 15 min.
  dias_maximos_antelacion  smallint    not null default 120
                                       check (dias_maximos_antelacion between 1 and 730),
  paso_minutos             smallint    not null default 15
                                       check (paso_minutos between 5 and 60),
  activa                   boolean     not null default true,
  creada_en                timestamptz not null default now()
);
alter table public.clinicas enable row level security;


-- -----------------------------------------------------------------------------
-- 2 · gabinetes  —  los sillones. Un gabinete = un recurso que no se duplica.
-- -----------------------------------------------------------------------------
create table if not exists public.gabinetes (
  id         uuid        primary key default gen_random_uuid(),
  clinica_id uuid        not null references public.clinicas(id) on delete cascade,
  nombre     text        not null,
  activo     boolean     not null default true,
  creado_en  timestamptz not null default now(),
  unique (clinica_id, nombre)
);
alter table public.gabinetes enable row level security;
create index if not exists gabinetes_clinica_id_idx on public.gabinetes (clinica_id);


-- -----------------------------------------------------------------------------
-- 3 · tratamientos  —  catalogo. Lo escribe la clinica, el bot lo lee filtrado.
-- -----------------------------------------------------------------------------
create table if not exists public.tratamientos (
  id            uuid        primary key default gen_random_uuid(),
  clinica_id    uuid        not null references public.clinicas(id) on delete cascade,
  codigo        text        not null,
  nombre        text        not null,
  duracion_min  smallint    not null check (duracion_min between 5 and 480),
  -- null = cualquier gabinete sirve, igual que el "cualquiera" de V1.
  gabinete_id   uuid        references public.gabinetes(id) on delete set null,
  frase_bot     text,
  -- Por defecto NO es publico. Lo que no diga que si, no sale de aqui.
  publico       boolean     not null default false,
  activo        boolean     not null default true,
  actualizado_en timestamptz not null default now(),
  unique (clinica_id, codigo)
);
alter table public.tratamientos enable row level security;
create index if not exists tratamientos_clinica_id_idx  on public.tratamientos (clinica_id);
create index if not exists tratamientos_gabinete_id_idx on public.tratamientos (gabinete_id);
-- Indice parcial: es exactamente la consulta que hace el bot en cada mensaje.
create index if not exists tratamientos_publicos_idx
  on public.tratamientos (clinica_id) where publico;


-- -----------------------------------------------------------------------------
-- 4 · horarios  —  tramos de apertura. `hora_inicio`/`hora_fin` son hora LOCAL
--     de la clinica; se convierten a timestamptz con clinicas.zona_horaria.
-- -----------------------------------------------------------------------------
create table if not exists public.horarios (
  id          uuid        primary key default gen_random_uuid(),
  clinica_id  uuid        not null references public.clinicas(id) on delete cascade,
  -- 0 = domingo ... 6 = sabado, igual que extract(dow from ...).
  dia_semana  smallint    not null check (dia_semana between 0 and 6),
  hora_inicio time        not null,
  hora_fin    time        not null,
  check (hora_inicio < hora_fin),
  unique (clinica_id, dia_semana, hora_inicio)
);
alter table public.horarios enable row level security;
create index if not exists horarios_clinica_dia_idx
  on public.horarios (clinica_id, dia_semana);


-- -----------------------------------------------------------------------------
-- 5 · config  —  pares clave/valor de la clinica. La columna `publico` decide
--     si el bot puede verlo.
-- -----------------------------------------------------------------------------
create table if not exists public.config (
  id             uuid        primary key default gen_random_uuid(),
  clinica_id     uuid        not null references public.clinicas(id) on delete cascade,
  clave          text        not null,
  valor          text        not null,
  publico        boolean     not null default false,
  comentario     text,
  actualizado_en timestamptz not null default now(),
  unique (clinica_id, clave)
);
alter table public.config enable row level security;
create index if not exists config_clinica_id_idx on public.config (clinica_id);
create index if not exists config_publicos_idx   on public.config (clinica_id) where publico;


-- -----------------------------------------------------------------------------
-- 6 · faq  —  preguntas con respuesta APROBADA. El bot las dice palabra por
--     palabra; no las reformula.
-- -----------------------------------------------------------------------------
create table if not exists public.faq (
  id                 uuid        primary key default gen_random_uuid(),
  clinica_id         uuid        not null references public.clinicas(id) on delete cascade,
  pregunta           text        not null,
  respuesta_aprobada text        not null,
  categoria          text,
  -- gemini-embedding-001 truncado a 768 dimensiones.
  embedding          extensions.vector(768),
  publico            boolean     not null default false,
  actualizada_en     timestamptz not null default now()
);
alter table public.faq enable row level security;
create index if not exists faq_clinica_id_idx on public.faq (clinica_id);
create index if not exists faq_publicas_idx   on public.faq (clinica_id) where publico;

-- Indice vectorial: deliberadamente NO se crea todavia.
-- V1 lo documenta: con 16 preguntas no hace falta ni de lejos, van todas en el
-- prompt. Se creara cuando una clinica pase de ~100 preguntas y F3 active la
-- recuperacion por similitud:
--
--   create index faq_embedding_idx on public.faq
--     using hnsw (embedding extensions.vector_cosine_ops);


-- -----------------------------------------------------------------------------
-- 7 · bloques_prompt  —  el prompt de sistema, troceado y versionado.
--     clinica_id es NOT NULL: cada clinica tiene su juego completo de bloques,
--     sembrado por el script de alta. No hay bloques "globales" con clinica_id
--     nulo, porque un NULL dentro de una politica RLS es la fuente numero uno
--     de fugas entre inquilinos.
-- -----------------------------------------------------------------------------
create table if not exists public.bloques_prompt (
  id            uuid        primary key default gen_random_uuid(),
  clinica_id    uuid        not null references public.clinicas(id) on delete cascade,
  orden         smallint    not null,
  titulo        text        not null,
  contenido     text        not null,
  activo        boolean     not null default true,
  version       integer     not null default 1,
  actualizado_en timestamptz not null default now(),
  unique (clinica_id, orden)
);
alter table public.bloques_prompt enable row level security;
create index if not exists bloques_prompt_clinica_id_idx
  on public.bloques_prompt (clinica_id);


-- -----------------------------------------------------------------------------
-- 8 · pacientes  —  ficha minima. Ni un campo de salud: el motivo de la visita
--     vive en citas.motivo_cerrado y es vocabulario cerrado.
-- -----------------------------------------------------------------------------
create table if not exists public.pacientes (
  id                uuid        primary key default gen_random_uuid(),
  clinica_id        uuid        not null references public.clinicas(id) on delete cascade,
  nombre            text        not null,
  apellidos         text,
  telefono_e164     text        not null check (telefono_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  email             text,
  consentimiento_en timestamptz,
  origen            public.origen_paciente not null default 'whatsapp',
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),
  unique (clinica_id, telefono_e164)
);
alter table public.pacientes enable row level security;
create index if not exists pacientes_clinica_id_idx on public.pacientes (clinica_id);


-- -----------------------------------------------------------------------------
-- 9 · conversaciones  —  un hilo de WhatsApp con un numero.
-- -----------------------------------------------------------------------------
create table if not exists public.conversaciones (
  id                 uuid        primary key default gen_random_uuid(),
  clinica_id         uuid        not null references public.clinicas(id) on delete cascade,
  telefono_e164      text        not null check (telefono_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  paciente_id        uuid        references public.pacientes(id) on delete set null,
  estado             public.estado_conversacion not null default 'abierta',
  requiere_humano    boolean     not null default false,
  ventana_24h_expira timestamptz,
  iniciada_en        timestamptz not null default now(),
  ultima_actividad   timestamptz not null default now()
);
alter table public.conversaciones enable row level security;
create index if not exists conversaciones_clinica_id_idx  on public.conversaciones (clinica_id);
create index if not exists conversaciones_paciente_id_idx on public.conversaciones (paciente_id);
-- El borrado a 90 dias barre por esta columna.
create index if not exists conversaciones_actividad_idx
  on public.conversaciones (clinica_id, ultima_actividad);
-- Una sola conversacion abierta por numero y clinica. Sin esto, dos webhooks a
-- la vez abren dos hilos y el bot se contesta a si mismo.
create unique index if not exists conversaciones_abierta_unica_idx
  on public.conversaciones (clinica_id, telefono_e164) where estado = 'abierta';


-- -----------------------------------------------------------------------------
-- 10 · citas
-- -----------------------------------------------------------------------------
create table if not exists public.citas (
  id             uuid        primary key default gen_random_uuid(),
  clinica_id     uuid        not null references public.clinicas(id) on delete cascade,
  paciente_id    uuid        not null references public.pacientes(id) on delete cascade,
  tratamiento_id uuid        not null references public.tratamientos(id) on delete restrict,
  gabinete_id    uuid        not null references public.gabinetes(id) on delete restrict,
  inicio         timestamptz not null,
  fin            timestamptz not null,
  estado         public.estado_cita  not null default 'provisional',
  -- Reserva provisional: el bot bloquea el hueco 10 minutos mientras el
  -- paciente confirma. Un job la libera si no confirma.
  expira_en      timestamptz,
  quien_reserva  public.quien_reserva not null default 'bot',
  -- VOCABULARIO CERRADO. Nunca texto libre. Es lo que mantiene el sistema
  -- fuera del Art. 9 del RGPD.
  motivo_cerrado public.motivo_visita not null default 'otro',
  conversacion_id uuid       references public.conversaciones(id) on delete set null,
  creada_en      timestamptz not null default now(),
  actualizada_en timestamptz not null default now(),
  check (fin > inicio),
  check (estado <> 'provisional' or expira_en is not null)
);
alter table public.citas enable row level security;
create index if not exists citas_clinica_id_idx      on public.citas (clinica_id);
create index if not exists citas_paciente_id_idx     on public.citas (paciente_id);
create index if not exists citas_tratamiento_id_idx  on public.citas (tratamiento_id);
create index if not exists citas_gabinete_id_idx     on public.citas (gabinete_id);
create index if not exists citas_conversacion_id_idx on public.citas (conversacion_id);
-- Igualdad primero, rango despues: es el orden que exige un indice compuesto.
create index if not exists citas_clinica_inicio_idx  on public.citas (clinica_id, inicio);
-- Solo las provisionales caducan; el job que las libera mira aqui.
create index if not exists citas_provisionales_idx
  on public.citas (expira_en) where estado = 'provisional';


-- -----------------------------------------------------------------------------
-- 11 · mensajes  —  el historial completo. Requisito del cliente, no un extra.
--      Es la tabla que mas crece: clave primaria bigint identity.
-- -----------------------------------------------------------------------------
create table if not exists public.mensajes (
  id              bigint      generated always as identity primary key,
  clinica_id      uuid        not null references public.clinicas(id) on delete cascade,
  conversacion_id uuid        not null references public.conversaciones(id) on delete cascade,
  rol             public.rol_mensaje not null,
  texto           text        not null,
  wa_message_id   text,
  estado_entrega  public.estado_entrega not null default 'pendiente',
  tokens_in       integer,
  tokens_out      integer,
  coste_eur       numeric(10,6),
  -- Registro de origen (barandilla): de que fila salio cada dato inyectado,
  -- en forma {"faq": ["faq#uuid", ...], "tratamientos": [...]}.
  origen          jsonb,
  creado_en       timestamptz not null default now()
);
alter table public.mensajes enable row level security;
create index if not exists mensajes_clinica_id_idx on public.mensajes (clinica_id);
create index if not exists mensajes_conversacion_idx
  on public.mensajes (conversacion_id, creado_en);
-- El borrado a 90 dias barre por aqui.
create index if not exists mensajes_clinica_creado_idx
  on public.mensajes (clinica_id, creado_en);
-- Un wa_message_id no se repite. Parcial porque los salientes no lo tienen
-- hasta que Meta responde.
create unique index if not exists mensajes_wa_message_id_idx
  on public.mensajes (clinica_id, wa_message_id) where wa_message_id is not null;


-- -----------------------------------------------------------------------------
-- 12 · escalados  —  la cola de recepcion.
-- -----------------------------------------------------------------------------
create table if not exists public.escalados (
  id              uuid        primary key default gen_random_uuid(),
  clinica_id      uuid        not null references public.clinicas(id) on delete cascade,
  conversacion_id uuid        references public.conversaciones(id) on delete set null,
  motivo          public.motivo_escalado not null,
  resumen         text,
  estado          public.estado_escalado not null default 'pendiente',
  resuelto_por    uuid        references auth.users(id) on delete set null,
  resuelto_en     timestamptz,
  creado_en       timestamptz not null default now()
);
alter table public.escalados enable row level security;
create index if not exists escalados_clinica_id_idx      on public.escalados (clinica_id);
create index if not exists escalados_conversacion_id_idx on public.escalados (conversacion_id);
create index if not exists escalados_resuelto_por_idx    on public.escalados (resuelto_por);
create index if not exists escalados_pendientes_idx
  on public.escalados (clinica_id, creado_en) where estado = 'pendiente';
-- IDEMPOTENCIA. V1 aprendio esto a golpes el 11/09: el modelo escalo cuatro
-- veces la misma conversacion y la llamada se cayo. Una conversacion no puede
-- tener dos escalados pendientes a la vez.
create unique index if not exists escalados_uno_pendiente_idx
  on public.escalados (clinica_id, conversacion_id)
  where estado = 'pendiente' and conversacion_id is not null;


-- -----------------------------------------------------------------------------
-- 13 · eventos_webhook  —  idempotencia del webhook de Meta. Meta reintenta;
--      procesar dos veces crearia citas duplicadas.
-- -----------------------------------------------------------------------------
create table if not exists public.eventos_webhook (
  id           bigint      generated always as identity primary key,
  clinica_id   uuid        not null references public.clinicas(id) on delete cascade,
  wa_event_id  text        not null,
  carga        jsonb,
  recibido_en  timestamptz not null default now(),
  procesado_en timestamptz,
  unique (clinica_id, wa_event_id)
);
alter table public.eventos_webhook enable row level security;
create index if not exists eventos_webhook_clinica_id_idx
  on public.eventos_webhook (clinica_id);
create index if not exists eventos_webhook_sin_procesar_idx
  on public.eventos_webhook (clinica_id, recibido_en) where procesado_en is null;


-- -----------------------------------------------------------------------------
-- 14 · eventos  —  observabilidad. Aqui escribe el CONTADOR de la barandilla 2:
--      tipo = 'contador_prompt', datos = {"faq": {"total": 16, "publicas": 14}}
-- -----------------------------------------------------------------------------
create table if not exists public.eventos (
  id         bigint      generated always as identity primary key,
  clinica_id uuid        not null references public.clinicas(id) on delete cascade,
  tipo       text        not null,
  datos      jsonb       not null default '{}'::jsonb,
  creado_en  timestamptz not null default now()
);
alter table public.eventos enable row level security;
create index if not exists eventos_clinica_tipo_idx
  on public.eventos (clinica_id, tipo, creado_en);


-- -----------------------------------------------------------------------------
-- 15 · auditoria  —  quien hizo que. Solo se anade, nunca se modifica.
-- -----------------------------------------------------------------------------
create table if not exists public.auditoria (
  id         bigint      generated always as identity primary key,
  clinica_id uuid        not null references public.clinicas(id) on delete cascade,
  actor      text        not null,
  accion     text        not null,
  tabla      text        not null,
  fila_id    text,
  datos      jsonb,
  creado_en  timestamptz not null default now()
);
alter table public.auditoria enable row level security;
create index if not exists auditoria_clinica_creado_idx
  on public.auditoria (clinica_id, creado_en);
