---
description: Entrevista a una clínica nueva y escribe su ficha de alta (fichas/<slug>.json)
argument-hint: "[nombre de la clínica]"
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

Da de alta la clínica: **$ARGUMENTS**.

El procedimiento entero —los tres pasos y el manual— está en
`entregas/alta-de-una-clinica.md`. **Este comando es el primero de los tres**:
la entrevista, y la ficha que sale de ella. No toca la base de datos.

> **Dar de alta una clínica no es insertar filas.** Cuatro de las cinco cosas
> que hacen falta **no dan ningún error cuando faltan**: la clínica queda
> creada, el panel se ve, y el bot dice el mensaje de urgencia de otra, o no
> manda recordatorios, o nadie puede entrar al panel.

## 1. Entrevista

Pregunta **de una en una**, en lenguaje de cliente — nunca «deployment»,
«environment variables» ni «schema»: di publicar, valores secretos, carpeta
de código, preparar, lanzar, conectar.

Lo que hay que sacar:

- Nombre, dirección, teléfono de recepción, email para avisos.
- Zona horaria y horarios de atención, día por día, con los descansos.
  **Un descanso son dos tramos, no uno.**
- Gabinetes: cuántos sillones hay. Un gabinete es lo que no se puede duplicar
  a la vez.
- Tratamientos: nombre, duración, gabinete y **la frase exacta** con la que
  el bot debe nombrarlo al paciente.
- Trato: «usted» o «tú». Nombre del asistente virtual.
- Preguntas frecuentes con su **respuesta aprobada, palabra por palabra**.
  El bot las dirá literalmente, no las reformula.
- Qué NO puede decir el bot: precios, márgenes, convenios, nombres de
  proveedores, cualquier cosa interna.

Y estas cuatro, que son las que se olvidaban y no avisan:

- **El identificador del número de WhatsApp** de la clínica dentro de la WABA
  (`wa_phone_number_id`, solo dígitos, lo da el panel de Meta). Sin él, el canal
  rechaza sus mensajes **y** se queda sin mandar recordatorios.
- **El enlace a su política de privacidad.** El bot tiene que darlo en el primer
  mensaje de cada conversación; es obligatorio, no cortesía.
- **Qué quiere que reciba quien escriba con dolor, hinchazón, un golpe o
  sangrado.** Unas dicen «llame al 900…», otras «pásese, hay hueco de urgencias
  todas las mañanas». Es un texto que firma la clínica, y **nunca** dice nada
  sobre el síntoma.
- **Quién entra al panel**: correo y papel de cada persona —propietario,
  recepción o solo lectura—. Hace falta al menos un propietario.

**Si piden un motivo de visita que no existe** («blanqueamiento», «urgencia
infantil»…), no lo apuntes como texto: los motivos son vocabulario cerrado
(`revision`, `urgencia`, `estetica`, `ortodoncia`, `otro`) y ampliarlos es una
**migración**, con confirmación explícita. Es lo que mantiene el sistema fuera
del artículo 9 del RGPD. Dilo y sigue con el resto.

## 2. Marca lo público

Por cada fila de `config`, `tratamientos` y `faq`, pregunta y anota
`publico` (true/false). **Ante la duda, `false`.** Lo confidencial no se le
esconde al bot: no le llega, porque la RLS no se lo devuelve.

No hay valor por defecto y el alta se niega si falta: que algo sea público es
una decisión de la clínica, no una que se pueda adivinar.

Las dos claves obligatorias (`politica_privacidad` y `mensaje_urgencia`) van
con `publico: true` **sin excepción**. Con `false` la fila existe y el bot no la
recibe, así que se comporta igual que si faltara — con la diferencia de que
mirando la base parece que está puesta.

## 3. Escribe la ficha

Un solo archivo: **`fichas/<slug>.json`**, con la forma de `fichas/ejemplo.json`
(está comentada y trae filas confidenciales de muestra). Nada más: no hay SQL
que escribir a mano, y los usuarios del panel no se pueden crear con un INSERT.

No metas credenciales dentro. Las fichas de clínicas reales no se suben al
repositorio, y `.gitignore` ya lo impide.

Comprueba la ficha sin tocar nada:

    node -e "import('./scripts/ficha.mjs').then(async m => console.log((await m.leerFicha('fichas/<slug>.json')).errores))"

## 4. Cierra

Enséñale a la clínica la lista de lo que el bot **sí** podrá decir y la de
lo que **no**, y pide confirmación explícita antes de ejecutar nada contra
la base de datos.

Y dile lo que falta después, que no es ejecutar el alta y ya:

    pnpm alta fichas/<slug>.json      # crea todo lo que se puede crear
    pnpm alta:comprobar <slug>        # el acta: cuatro de los cinco puntos

Más el par de `WHATSAPP_CLINICAS` con su nuevo despliegue, y las plantillas de
Meta (`entregas/plantillas-meta.md`), que es el único punto que no se puede
comprobar desde el código.
