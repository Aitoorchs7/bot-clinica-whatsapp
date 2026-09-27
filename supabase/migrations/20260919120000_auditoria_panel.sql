-- =============================================================================
-- F5 · 008 · El panel puede dejar rastro en `auditoria`
-- =============================================================================
-- POR QUE EXISTE ESTA MIGRACION
--
-- F5 pone en manos de la clinica el interruptor `publico`, que es la superficie
-- de control de la barandilla 1: quien lo mueve decide que puede decir el bot.
-- Un cambio asi tiene que dejar escrito quien lo hizo y cuando.
--
-- Y hoy no cabe. `auditoria` tenia dos politicas y ninguna sirve para esto:
--
--   auditoria_bot_insert    -> solo el rol `bot`
--   auditoria_clinica_select-> el panel LEE el rastro, pero no puede escribirlo
--
-- Un `insert` desde el panel lo rechaza la RLS. Las tres salidas eran: una
-- funcion SECURITY DEFINER (cero en todo el proyecto, y abrir un agujero para
-- poder medir que no hay agujeros es justo lo que ESTADO_F2 §7 descarto),
-- `service_role` en el navegador (prohibido sin excepciones), o esta politica.
--
-- QUE HACE Y QUE NO HACE
--
-- Solo AÑADE. No toca, no reescribe y no relaja ninguna politica existente:
-- `auditoria` sigue sin UPDATE y sin DELETE para nadie —la 004 revoca los dos
-- privilegios al rol `authenticated`— asi que el rastro solo puede crecer.
--
-- `lectura` sigue sin poder escribir: la condicion es `puede_escribir()`, que
-- son `propietario` y `recepcion` y nada mas.
--
-- LA TERCERA LINEA DEL WITH CHECK ES LA QUE IMPORTA
--
-- `actor = auth.uid()::text` clava la firma al usuario que tiene la sesion. Sin
-- ella, recepcion podria anotar que el implante lo hizo publico el propietario.
-- Un registro de auditoria que se puede firmar con el nombre de otro no es un
-- registro de auditoria: es una coartada.
--
-- Este archivo esta sujeto a la regla de "no tocar sin confirmacion explicita"
-- de .claude/CLAUDE.md, y esa confirmacion se pidio y se dio antes de
-- escribirlo.
-- =============================================================================

alter table public.auditoria enable row level security;

drop policy if exists auditoria_clinica_insert on public.auditoria;
create policy auditoria_clinica_insert on public.auditoria
  for insert to authenticated
  with check (
        (select autorizacion.puede_escribir())
    and clinica_id = (select autorizacion.clinica_id())
    and actor = (select auth.uid())::text
  );

comment on column public.auditoria.actor is
  'Quien hizo el cambio. Desde el panel es el uuid del usuario con sesion, y la '
  'politica auditoria_clinica_insert no admite otro valor: nadie puede firmar '
  'un cambio con el nombre de otro. El bot escribe aqui su propia marca.';
