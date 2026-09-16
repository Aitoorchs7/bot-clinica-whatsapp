---
description: Auditoría de seguridad completa del proyecto (método del curso + RLS y barandillas de este bot)
argument-hint: "[ruta o área a auditar; vacío = todo el proyecto]"
allowed-tools: Read, Grep, Glob, Bash, Write, Task
---

Lanza el subagente `revisor-seguridad` sobre: **$ARGUMENTS** (si está vacío,
sobre todo el proyecto).

El subagente debe recorrer entero `.claude/referencias/seguridad.md` — las
diez secciones, sin saltarse ninguna — y añadir lo propio de este producto:
aislamiento por `clinica_id`, rol `bot` limitado a `publico = true`,
`app_metadata` nunca `user_metadata`, `service_role` fuera del navegador y
del camino del bot, firma del webhook sobre el cuerpo crudo, `proxy.ts` en
lugar de `middleware.ts`, y las cuatro barandillas.

Reglas de manejo, sin excepción:
- **No abras `.env` ni `.env.local`.** Trabaja con nombres de variable.
- Ningún valor de secreto aparece en el informe, ni truncado ni
  parcialmente enmascarado.

Cuando termine, resume aquí en cinco líneas: veredicto (APTO / NO APTO),
cuántos hallazgos de cada severidad, y el 🔴 más grave si lo hay. El informe
completo queda en `AUDITORIA-SEGURIDAD-<AAAA-MM-DD>.md`.

Si sale algún 🔴 CRÍTICO, no propongas desplegar: propone el arreglo.
