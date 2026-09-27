---
orden: 0
activo: no
titulo: Leeme primero
---

# Cómo funciona esta carpeta

Cada nota de aquí es **un trozo del prompt del asistente**. Se ordenan por el campo `orden` de su frontmatter y el resultado es lo que lee el modelo antes de contestar.

> [!warning] Esta nota no entra en el prompt
> Lleva `activo: no`. Las que empiezan por `_` tampoco entran. Todo lo demás sí.

## Estos archivos son el original, no la copia que lee el bot

El bot no lee esta carpeta. Lee la tabla `bloques_prompt` de Supabase: una fila por bloque **y por clínica**, que es donde la clínica los edita desde el panel sin tocar el código.

`scripts/sembrar-bloques.mjs` lleva esta carpeta a esa tabla:

```
pnpm bloques rls-prueba-a
```

No hay bloques «globales» con `clinica_id` nulo. Cada clínica tiene su juego completo, porque un NULL dentro de una política RLS es la fuente número uno de fugas entre inquilinos.

## El frontmatter

```
---
orden: 30        <- posicion en el prompt. De 10 en 10, para poder meter cosas en medio
activo: si       <- pon "no" para desactivar un bloque sin borrarlo
titulo: Nombre   <- etiqueta corta heredada de la V1. NO viaja a la base de datos
---
```

El título que acaba en la columna `bloques_prompt.titulo` es **el nombre del archivo sin el `.md`** —`25 - No interpretes de mas`—, no el del frontmatter. Así hay un solo nombre: es único, ordena solo y es el que lleva la convención del guion bajo.

## Los huecos

Se escriben con dobles llaves y los rellena `src/lib/barandillas/montaje.ts` con lo que le pasa `filtro.ts`, que lee la base de datos **con el cliente del bot**:

| Hueco | Se convierte en |
| --- | --- |
| `{{clinica}}` | El nombre de la clínica |
| `{{bot}}` | El nombre del asistente |
| `{{trato}}` | «Trata de usted» o «Tutea», según la clínica |
| `{{privacidad}}` | El enlace a la política de privacidad, solo y literal |
| `{{fecha_hoy}}` | Hoy, en palabras, con la hora, en la zona horaria de la clínica |
| `{{datos}}` | Las filas **públicas** de `config`, más el teléfono de recepción |
| `{{tratamientos}}` | Los tratamientos **públicos**, con su duración |
| `{{faq}}` | Las preguntas **públicas** con su respuesta aprobada |
| `{{horario}}` | Los tramos de apertura |

Si escribes un hueco que no existe, el montaje lo avisa en el registro y lo deja tal cual, sin romperse. No revienta el prompt por una llave mal escrita.

Que en la tabla ponga «públicas» no es un filtro del montador: es la RLS. La fila con `publico = false` **no le llega** al bot. Ver `.claude/CLAUDE.md`, las cuatro barandillas.

## La regla de oro

Aquí se escribe **cómo habla**. Lo que **sabe** va en la base de datos.

Si metes aquí un precio, la clínica no puede cambiarlo sin llamarte. Si lo metes en `config` o en `faq`, lo cambia ella un martes por la mañana y el bot lo dice esa misma tarde.

## Qué cambió al pasar de la V1 telefónica a WhatsApp

- El canal es escrito: se fueron «los números en palabras», «nada de emojis ni listas» y «esto es una llamada». Emojis y listas ahora valen, con mucha moderación.
- «Cuando cuesta entenderse» ya no habla de dicción, sino de faltas de ortografía, notas de voz transcritas y mensajes cortados.
- Hay un bloque nuevo, `05 - Aviso inicial`: el bot dice que es un asistente virtual y enlaza la política de privacidad en el primer mensaje de cada conversación. Es obligatorio, no cortesía, y por eso el enlace tiene hueco propio (`{{privacidad}}`) en vez de ser una línea más dentro de `{{datos}}`: entra solo y literal, y el bloque manda copiarlo tal cual. El valor sale de la clave `politica_privacidad` de `config`, así que lo cambia la clínica sin tocar el código.
- `25 - No interpretes de mas` y `30 - Que no puede decir` están **palabra por palabra** como en la V1. Son el núcleo del producto y el canal no los toca.
