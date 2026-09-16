---
description: Entrevista a una clínica nueva y genera su seed de configuración, tratamientos, FAQ, horarios y gabinetes
argument-hint: "[nombre de la clínica]"
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

Da de alta la clínica: **$ARGUMENTS**.

Si existe la skill `alta-clinica`, úsala. Si no, sigue esto.

## 1. Entrevista

Pregunta **de una en una**, en lenguaje de cliente — nunca «deployment»,
«environment variables» ni «schema»: di publicar, valores secretos, carpeta
de código, preparar, lanzar, conectar.

Lo que hay que sacar:
- Nombre, dirección, teléfono de recepción, email para avisos.
- Zona horaria y horarios de atención, día por día, con los descansos.
- Gabinetes y cuántos pacientes a la vez.
- Tratamientos: nombre, duración, gabinete y **la frase exacta** con la que
  el bot debe nombrarlo al paciente.
- Trato: «usted» o «tú». Nombre del asistente virtual.
- Preguntas frecuentes con su **respuesta aprobada, palabra por palabra**.
  El bot las dirá literalmente, no las reformula.
- Qué NO puede decir el bot: precios, márgenes, convenios, nombres de
  proveedores, cualquier cosa interna.

## 2. Marca lo público

Por cada fila de `config`, `tratamientos` y `faq`, pregunta y anota
`publico` (true/false). **Ante la duda, `false`.** Lo confidencial no se le
esconde al bot: no le llega, porque la RLS no se lo devuelve.

## 3. Genera

Un archivo SQL en `supabase/seeds/<slug>.sql`:
- `INSERT` en `clinicas`, `config`, `tratamientos`, `faq`, `horarios`,
  `gabinetes`, todos con el mismo `clinica_id`.
- Sin credenciales dentro. `wa_phone_number_id` y demás identificadores de
  Meta se piden aparte y van a `.env.local`, que **tú no creas ni lees**.
- Los embeddings de la FAQ se generan después con el script del proyecto,
  no a mano.

## 4. Cierra

Enséñale a la clínica la lista de lo que el bot **sí** podrá decir y la de
lo que **no**, y pide confirmación explícita antes de ejecutar nada contra
la base de datos.
