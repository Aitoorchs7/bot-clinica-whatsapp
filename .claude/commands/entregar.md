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
  `*.log`, `coverage/`, `playwright-report/`.
- Ninguna clave en el historial de Git.

## 3. Publicación

Despliegue en Vercel con las variables cargadas en el panel de Vercel, no en
archivos. Webhook de Meta apuntando a la URL de producción y verificado.
Vercel Cron (recordatorios) y `pg_cron` (borrado a 3 meses) activos y con su
última ejecución comprobada.

## 4. Lo que se le entrega a la clínica

- Un documento corto en español, sin tecnicismos: qué hace el bot, qué no
  hace, y qué pasa cuando no sabe algo (mensaje seguro, teléfono y aviso al
  equipo).
- Cómo editar sus propias FAQ, horarios y tratamientos desde el panel, y
  qué significa marcar algo como público.
- El diagrama de arquitectura (skill `excalidraw-diagram`).
- A quién llamar y qué se hace si el bot se cae.

Al hablar con el cliente: publicar, carpeta de código, valores secretos,
preparar, lanzar, conectar. Nunca: deployment, repository, environment
variables, refactor, build, pipeline.
