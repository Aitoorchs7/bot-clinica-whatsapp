-- =============================================================================
-- F1 · 001 · Extensiones
-- =============================================================================
-- Tres extensiones, cada una con un motivo concreto:
--
--   vector      -> embeddings de la FAQ, 768 dimensiones (gemini-embedding-001
--                  truncado). Solo hace falta cuando una clinica pase de 100
--                  preguntas; por debajo de eso van todas en el prompt.
--   btree_gist  -> permite mezclar un operador de igualdad (gabinete_id, que es
--                  uuid) con uno de solape (tstzrange) dentro del mismo
--                  constraint EXCLUDE. Sin esta extension, `sin_solape` no se
--                  puede crear.
--   pg_cron     -> borrado de conversaciones y mensajes a los 90 dias.
--
-- Nota: pg_cron solo corre en la base de datos `postgres`, que es la que usa
-- Supabase. Crea su propio esquema `cron` con las tablas `cron.job` y
-- `cron.job_run_details`.
-- =============================================================================

create extension if not exists vector      with schema extensions;
create extension if not exists btree_gist  with schema extensions;
create extension if not exists pg_cron;

-- El rol `postgres` es el que programa y ejecuta los jobs de retencion.
grant usage on schema cron to postgres;
