-- =============================================================================
-- F1 · 003 · sin_solape
-- =============================================================================
-- Dos citas en el mismo gabinete a la misma hora son IMPOSIBLES. No porque el
-- modelo se porte bien, sino porque la base de datos no las admite: aunque el
-- cerebro se equivoque y aunque dos webhooks entren a la vez, una de las dos
-- inserciones muere con SQLSTATE 23P01 (exclusion_violation).
--
-- `crear_cita` (migracion 005) captura ese error y devuelve
-- {ok: false, motivo: 'ocupado'} en vez de un 500.
--
-- Estados que OCUPAN el sillon:
--   provisional  -> el bot ha ofrecido el hueco y espera confirmacion (10 min).
--                   Cuenta desde el primer segundo: es justo lo que impide que
--                   dos pacientes escribiendo a la vez cojan la misma hora.
--   confirmada   -> obvio.
--   completada   -> la cita ya paso, pero siguio ocupando ese hueco.
--
-- Estados que LO LIBERAN: cancelada, no_presentada.
--
-- Este constraint esta en la lista de "no tocar sin confirmacion explicita" de
-- .claude/CLAUDE.md.
-- =============================================================================

-- `ADD CONSTRAINT IF NOT EXISTS` no existe en PostgreSQL: la migracion fallaria
-- con un error de sintaxis. El bloque DO consultando pg_constraint es la unica
-- forma idempotente.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sin_solape'
      and conrelid = 'public.citas'::regclass
  ) then
    alter table public.citas add constraint sin_solape
      exclude using gist (
        gabinete_id                    with =,
        tstzrange(inicio, fin, '[)')   with &&
      ) where (estado in ('provisional', 'confirmada', 'completada'));
  end if;
end $$;

comment on constraint sin_solape on public.citas is
  'Impide dos citas solapadas en el mismo gabinete. Necesita la extension '
  'btree_gist para poder mezclar la igualdad de un uuid con el solape de un '
  'rango. El rango es semiabierto [inicio, fin): una cita que acaba a las 10:00 '
  'y otra que empieza a las 10:00 NO solapan.';
