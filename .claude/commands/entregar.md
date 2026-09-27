---
description: Prepara y entrega el proyecto al cliente siguiendo el método AILINK
argument-hint: "[clínica o entorno de destino]"
allowed-tools: Read, Write, Edit, Grep, Glob, Bash, Task
---

Prepara la entrega para: **$ARGUMENTS**.

Usa las skills `production-ready` y `deploy` (método AILINK). El orden no se
altera: **nada se publica antes de pasar los dos filtros de seguridad.**

## 1. Antes de tocar nada

- `/auditoria-seguridad` → veredicto **APTO**. Un solo 🔴 y se para aquí.
- `/prueba-fuga` → sin fugas, y el contador de la barandilla 2 en verde.

## 2. Comprobaciones técnicas

- `pnpm build` limpio.
- `pnpm vitest run` en verde, incluida la prueba del contador de filas.
- `pnpm playwright test` sobre el panel.
- `.env.example` al día, con todas las claves y ninguna con valor.
- `.gitignore` cubre `.env`, `.env.local`, `node_modules/`, `.next/`,
  `*.log`, `coverage/`, `playwright-report/` y `fichas/*.json`.
- Ninguna clave en el historial de Git.

## 3. La clínica, dada de alta

**Publicar no es dar de alta.** Son dos cosas y el orden importa: el alta
escribe en la base y en Auth; el despliegue lleva el código y las variables.
El procedimiento entero, con sus tres pasos, está en
`entregas/alta-de-una-clinica.md`.

- `pnpm alta fichas/<slug>.json` → la clínica, su conocimiento, sus bloques de
  prompt y sus usuarios del panel.
- `pnpm alta:comprobar <slug>` → el acta. **Cuatro de los cinco puntos.**
  Mientras salga rojo, la clínica está creada, que no es lo mismo que dada de
  alta.
- El par `"<phone_number_id>": "<clinica_id>"` en `WHATSAPP_CLINICAS`
  **y un despliegue nuevo**. Las dos cosas o ninguna.
- `pnpm alta:comprobar <slug> --plantilla <móvil>` → el quinto punto, con un
  móvil delante. Ver `entregas/plantillas-meta.md`.

## 4. Publicación

Despliegue en Vercel con las variables cargadas en el panel de Vercel, no en
archivos. Webhook de Meta apuntando a la URL de producción y verificado.
Vercel Cron (recordatorios) y `pg_cron` (borrado a 3 meses) activos y con su
última ejecución comprobada.

**Las migraciones van antes que el código.** La 010 (`borrador jsonb` y
`rondas_aclaracion` en `conversaciones`) está aplicada en desarrollo y no en
producción: sin ella el canal lee dos columnas que no existen y no contesta a
nadie.

Y comprueba el horario del cron contra el plan de Vercel: si el plan solo admite
crons diarios, hay que poner `RECORDATORIO_HORAS_ANTES=48`; si no, las citas de
dentro de entre 24 y 48 horas no reciben aviso.

## 5. Lo que se le entrega a la clínica

- Un documento corto en español, sin tecnicismos: qué hace el bot, qué no
  hace, y qué pasa cuando no sabe algo (mensaje seguro, teléfono y aviso al
  equipo).
- Cómo editar sus propias FAQ, horarios y tratamientos desde el panel, y
  qué significa marcar algo como público.
- El enlace para que cada persona ponga su contraseña del panel — uno por
  persona, por un canal privado. Caducan.
- El diagrama de arquitectura (skill `excalidraw-diagram`).
- A quién llamar y qué se hace si el bot se cae.

Al hablar con el cliente: publicar, carpeta de código, valores secretos,
preparar, lanzar, conectar. Nunca: deployment, repository, environment
variables, refactor, build, pipeline.
